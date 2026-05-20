import { createId, schema, type Database } from "@claude-organizer/db";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { notify } from "./events";
import { listCardTags, tagsByCardIds } from "./tags";

const cardStatus = z.enum([
  "todo",
  "in_progress",
  "review",
  "done",
  "blocked",
]);

export const createCardInput = z.object({
  projectId: z.string(),
  sprintId: z.string().optional(),
  title: z.string().min(1).max(200),
  summary: z.string().max(200).optional(),
  descriptionMd: z.string().optional(),
  status: cardStatus.optional(),
  priority: z.number().int().min(0).max(10).optional(),
  dueDate: z.coerce.date().optional(),
});
export type CreateCardInput = z.infer<typeof createCardInput>;

export const updateCardInput = z.object({
  id: z.string(),
  title: z.string().min(1).max(200).optional(),
  summary: z.string().max(200).nullable().optional(),
  descriptionMd: z.string().optional(),
  status: cardStatus.optional(),
  priority: z.number().int().min(0).max(10).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  sprintId: z.string().nullable().optional(),
});
export type UpdateCardInput = z.infer<typeof updateCardInput>;

export interface ListCardsFilters {
  projectId: string;
  sprintId?: string | null;
  status?: z.infer<typeof cardStatus>;
  backlogOnly?: boolean;
}

const cardSummaryColumns = {
  id: schema.cards.id,
  projectId: schema.cards.projectId,
  sprintId: schema.cards.sprintId,
  key: schema.cards.key,
  title: schema.cards.title,
  summary: schema.cards.summary,
  status: schema.cards.status,
  priority: schema.cards.priority,
  dueDate: schema.cards.dueDate,
  position: schema.cards.position,
  createdAt: schema.cards.createdAt,
  updatedAt: schema.cards.updatedAt,
};

export async function listCards(db: Database, filters: ListCardsFilters) {
  const conditions = [eq(schema.cards.projectId, filters.projectId)];
  if (filters.backlogOnly) {
    conditions.push(isNull(schema.cards.sprintId));
  } else if (filters.sprintId !== undefined) {
    conditions.push(
      filters.sprintId === null
        ? isNull(schema.cards.sprintId)
        : eq(schema.cards.sprintId, filters.sprintId),
    );
  }
  if (filters.status) {
    conditions.push(eq(schema.cards.status, filters.status));
  }
  const rows = await db
    .select(cardSummaryColumns)
    .from(schema.cards)
    .where(and(...conditions))
    .orderBy(asc(schema.cards.position), desc(schema.cards.createdAt));
  const tagMap = await tagsByCardIds(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }));
}

export async function getCard(db: Database, id: string) {
  const [row] = await db
    .select()
    .from(schema.cards)
    .where(eq(schema.cards.id, id))
    .limit(1);
  if (!row) return null;
  return { ...row, tags: await listCardTags(db, row.id) };
}

export async function getCardByKey(db: Database, key: string) {
  const [row] = await db
    .select()
    .from(schema.cards)
    .where(eq(schema.cards.key, key))
    .limit(1);
  if (!row) return null;
  return { ...row, tags: await listCardTags(db, row.id) };
}

export async function createCard(db: Database, input: CreateCardInput) {
  const parsed = createCardInput.parse(input);
  const row = await db.transaction(async (tx) => {
    const [project] = await tx
      .update(schema.projects)
      .set({ nextKeySeq: sql`${schema.projects.nextKeySeq} + 1` })
      .where(eq(schema.projects.id, parsed.projectId))
      .returning({
        keyPrefix: schema.projects.keyPrefix,
        nextSeq: schema.projects.nextKeySeq,
      });
    if (!project) {
      throw new Error(`Project ${parsed.projectId} not found`);
    }
    const cardKey = `${project.keyPrefix}-${project.nextSeq - 1}`;
    const [created] = await tx
      .insert(schema.cards)
      .values({
        id: createId("crd"),
        projectId: parsed.projectId,
        sprintId: parsed.sprintId,
        key: cardKey,
        title: parsed.title,
        summary: parsed.summary,
        descriptionMd: parsed.descriptionMd,
        status: parsed.status ?? "todo",
        priority: parsed.priority ?? 0,
        dueDate: parsed.dueDate,
      })
      .returning();
    return created;
  });
  if (row) {
    await notify(db, {
      type: "card.changed",
      projectId: row.projectId,
      cardId: row.id,
      cardKey: row.key,
    });
  }
  return row;
}

export async function updateCard(db: Database, input: UpdateCardInput) {
  const parsed = updateCardInput.parse(input);
  const { id, ...rest } = parsed;
  const [row] = await db
    .update(schema.cards)
    .set({ ...rest, updatedAt: sql`now()` })
    .where(eq(schema.cards.id, id))
    .returning();
  if (row) {
    await notify(db, {
      type: "card.changed",
      projectId: row.projectId,
      cardId: row.id,
      cardKey: row.key,
    });
  }
  return row ?? null;
}

export async function moveCardToBacklog(db: Database, cardId: string) {
  return updateCard(db, { id: cardId, sprintId: null });
}

export async function moveCardToSprint(
  db: Database,
  cardId: string,
  sprintId: string,
) {
  return updateCard(db, { id: cardId, sprintId });
}
