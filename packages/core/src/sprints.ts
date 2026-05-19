import { createId, schema, type Database } from "@claude-organizer/db";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { notify } from "./events";

export const createSprintInput = z.object({
  projectId: z.string(),
  roadmapId: z.string().optional(),
  name: z.string().min(1).max(120),
  goal: z.string().max(500).optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
});
export type CreateSprintInput = z.infer<typeof createSprintInput>;

export async function listSprints(db: Database, projectId: string) {
  return db
    .select()
    .from(schema.sprints)
    .where(eq(schema.sprints.projectId, projectId))
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
      ),
    )
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
      .set({ status: "active", updatedAt: sql`now()` })
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
    .set({ status: "completed", updatedAt: sql`now()` })
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
