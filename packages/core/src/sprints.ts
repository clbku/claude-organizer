import { createId, schema, type Database } from "@claude-organizer/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { notify } from "./events";
import { archivedCondition, type ArchiveFilter } from "./archive";

export const createSprintInput = z.object({
  projectId: z.string(),
  roadmapId: z.string().optional(),
  name: z.string().min(1).max(120),
  goal: z.string().max(500).optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
});
export type CreateSprintInput = z.infer<typeof createSprintInput>;

export const updateSprintInput = z.object({
  id: z.string(),
  name: z.string().min(1).max(120).optional(),
  goal: z.string().max(500).nullable().optional(),
});
export type UpdateSprintInput = z.infer<typeof updateSprintInput>;

export async function listSprints(
  db: Database,
  projectId: string,
  filter?: ArchiveFilter,
) {
  const conditions = [eq(schema.sprints.projectId, projectId)];
  const archived = archivedCondition(schema.sprints.archivedAt, filter);
  if (archived) conditions.push(archived);
  return db
    .select()
    .from(schema.sprints)
    .where(and(...conditions))
    .orderBy(schema.sprints.createdAt);
}

export async function getActiveSprint(db: Database, projectId: string) {
  const [row] = await db
    .select()
    .from(schema.sprints)
    .where(
      and(
        eq(schema.sprints.projectId, projectId),
        eq(schema.sprints.status, "active"),
        isNull(schema.sprints.archivedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getSprint(db: Database, id: string) {
  const [row] = await db
    .select()
    .from(schema.sprints)
    .where(eq(schema.sprints.id, id))
    .limit(1);
  return row ?? null;
}

export async function createSprint(db: Database, input: CreateSprintInput) {
  const parsed = createSprintInput.parse(input);
  const [row] = await db
    .insert(schema.sprints)
    .values({
      id: createId("spr"),
      projectId: parsed.projectId,
      roadmapId: parsed.roadmapId,
      name: parsed.name,
      goal: parsed.goal,
      startsAt: parsed.startsAt,
      endsAt: parsed.endsAt,
      status: "planned",
    })
    .returning();
  return row;
}

export async function updateSprint(db: Database, input: UpdateSprintInput) {
  const parsed = updateSprintInput.parse(input);
  const { id, ...rest } = parsed;
  const [row] = await db
    .update(schema.sprints)
    .set({ ...rest, updatedAt: sql`now()` })
    .where(eq(schema.sprints.id, id))
    .returning();
  if (row) {
    await notify(db, {
      type: "sprint.changed",
      projectId: row.projectId,
      sprintId: row.id,
    });
  }
  return row ?? null;
}

// --- Archive / restore / destroy ---

export async function archiveSprint(db: Database, id: string) {
  const [row] = await db
    .update(schema.sprints)
    .set({ archivedAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(schema.sprints.id, id))
    .returning();
  if (row) {
    await notify(db, {
      type: "sprint.changed",
      projectId: row.projectId,
      sprintId: row.id,
    });
  }
  return row ?? null;
}

export async function restoreSprint(db: Database, id: string) {
  const [row] = await db
    .update(schema.sprints)
    .set({ archivedAt: null, updatedAt: sql`now()` })
    .where(eq(schema.sprints.id, id))
    .returning();
  if (row) {
    await notify(db, {
      type: "sprint.changed",
      projectId: row.projectId,
      sprintId: row.id,
    });
  }
  return row ?? null;
}

/**
 * Hard-delete a sprint and its cards. The `cards.sprintId` FK is `set null`,
 * so cards are deleted explicitly (their comments/tags/blockers cascade).
 */
export async function destroySprint(db: Database, id: string) {
  const row = await db.transaction(async (tx) => {
    const [sprint] = await tx
      .select({ id: schema.sprints.id, projectId: schema.sprints.projectId })
      .from(schema.sprints)
      .where(eq(schema.sprints.id, id))
      .limit(1);
    if (!sprint) return null;
    await tx.delete(schema.cards).where(eq(schema.cards.sprintId, id));
    await tx.delete(schema.sprints).where(eq(schema.sprints.id, id));
    return sprint;
  });
  if (row) {
    await notify(db, {
      type: "sprint.deleted",
      projectId: row.projectId,
      sprintId: row.id,
    });
  }
  return row ?? null;
}

export async function startSprint(db: Database, sprintId: string) {
  const row = await db.transaction(async (tx) => {
    const [sprint] = await tx
      .select()
      .from(schema.sprints)
      .where(eq(schema.sprints.id, sprintId))
      .limit(1);
    if (!sprint) return null;

    await tx
      .update(schema.sprints)
      .set({ status: "completed", updatedAt: sql`now()` })
      .where(
        and(
          eq(schema.sprints.projectId, sprint.projectId),
          eq(schema.sprints.status, "active"),
        ),
      );

    const [activated] = await tx
      .update(schema.sprints)
      .set({
        status: "active",
        startsAt: sql`COALESCE(${schema.sprints.startsAt}, now())`,
        updatedAt: sql`now()`,
      })
      .where(eq(schema.sprints.id, sprintId))
      .returning();
    return activated ?? null;
  });
  if (row) {
    await notify(db, {
      type: "sprint.changed",
      projectId: row.projectId,
      sprintId: row.id,
    });
  }
  return row;
}

export async function completeSprint(db: Database, sprintId: string) {
  const [row] = await db
    .update(schema.sprints)
    .set({
      status: "completed",
      endsAt: sql`COALESCE(${schema.sprints.endsAt}, now())`,
      updatedAt: sql`now()`,
    })
    .where(eq(schema.sprints.id, sprintId))
    .returning();
  if (row) {
    await notify(db, {
      type: "sprint.changed",
      projectId: row.projectId,
      sprintId: row.id,
    });
  }
  return row ?? null;
}
