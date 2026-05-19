import { createId, schema, type Database } from "@claude-organizer/db";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { notify } from "./events";

const docKind = z.enum(["module", "adr", "guide", "note"]);

export const createDocInput = z.object({
  projectId: z.string(),
  parentId: z.string().nullable().optional(),
  title: z.string().min(1).max(200),
  summary: z.string().max(200).optional(),
  bodyMd: z.string().optional(),
  kind: docKind.optional(),
  position: z.number().int().min(0).optional(),
});
export type CreateDocInput = z.infer<typeof createDocInput>;

export const updateDocInput = z.object({
  id: z.string(),
  title: z.string().min(1).max(200).optional(),
  summary: z.string().max(200).nullable().optional(),
  bodyMd: z.string().nullable().optional(),
  kind: docKind.optional(),
  parentId: z.string().nullable().optional(),
  position: z.number().int().min(0).optional(),
});
export type UpdateDocInput = z.infer<typeof updateDocInput>;

const docListColumns = {
  id: schema.docs.id,
  projectId: schema.docs.projectId,
  parentId: schema.docs.parentId,
  title: schema.docs.title,
  summary: schema.docs.summary,
  kind: schema.docs.kind,
  position: schema.docs.position,
  createdAt: schema.docs.createdAt,
  updatedAt: schema.docs.updatedAt,
};

export async function listDocs(
  db: Database,
  projectId: string,
  kind?: z.infer<typeof docKind>,
) {
  const conditions = [eq(schema.docs.projectId, projectId)];
  if (kind) conditions.push(eq(schema.docs.kind, kind));
  return db
    .select(docListColumns)
    .from(schema.docs)
    .where(and(...conditions))
    .orderBy(asc(schema.docs.position), asc(schema.docs.title));
}

export async function getDoc(db: Database, id: string) {
  const [row] = await db
    .select()
    .from(schema.docs)
    .where(eq(schema.docs.id, id))
    .limit(1);
  return row ?? null;
}

export async function createDoc(db: Database, input: CreateDocInput) {
  const parsed = createDocInput.parse(input);
  const [row] = await db
    .insert(schema.docs)
    .values({
      id: createId("doc"),
      projectId: parsed.projectId,
      parentId: parsed.parentId ?? null,
      title: parsed.title,
      summary: parsed.summary,
      bodyMd: parsed.bodyMd,
      kind: parsed.kind ?? "note",
      position: parsed.position ?? 0,
    })
    .returning();
  if (row) {
    await notify(db, { type: "doc.changed", projectId: row.projectId, docId: row.id });
  }
  return row;
}

export async function updateDoc(db: Database, input: UpdateDocInput) {
  const parsed = updateDocInput.parse(input);
  const { id, ...rest } = parsed;
  const [row] = await db
    .update(schema.docs)
    .set({ ...rest, updatedAt: sql`now()` })
    .where(eq(schema.docs.id, id))
    .returning();
  if (row) {
    await notify(db, { type: "doc.changed", projectId: row.projectId, docId: row.id });
  }
  return row ?? null;
}

export async function deleteDoc(db: Database, id: string) {
  const [row] = await db
    .delete(schema.docs)
    .where(eq(schema.docs.id, id))
    .returning({ id: schema.docs.id, projectId: schema.docs.projectId });
  if (row) {
    await notify(db, {
      type: "doc.changed",
      projectId: row.projectId,
      docId: row.id,
    });
  }
  return row ?? null;
}

export async function searchDocs(
  db: Database,
  projectId: string,
  query: string,
) {
  const term = `%${query}%`;
  return db
    .select(docListColumns)
    .from(schema.docs)
    .where(
      and(
        eq(schema.docs.projectId, projectId),
        or(ilike(schema.docs.title, term), ilike(schema.docs.bodyMd, term)),
      ),
    )
    .orderBy(asc(schema.docs.title))
    .limit(50);
}
