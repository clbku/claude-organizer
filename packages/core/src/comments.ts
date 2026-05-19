import { createId, schema, type Database } from "@claude-organizer/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { notify } from "./events";

export const addCommentInput = z.object({
  cardId: z.string(),
  author: z.enum(["ai", "user"]),
  bodyMd: z.string().min(1),
});
export type AddCommentInput = z.infer<typeof addCommentInput>;

export async function listComments(
  db: Database,
  cardId: string,
  options: { markAsRead?: boolean } = {},
) {
  const rows = await db
    .select()
    .from(schema.comments)
    .where(eq(schema.comments.cardId, cardId))
    .orderBy(asc(schema.comments.createdAt));

  if (options.markAsRead) {
    const unreadIds = rows
      .filter((r) => r.author === "user" && !r.readByAi)
      .map((r) => r.id);
    if (unreadIds.length) {
      await db
        .update(schema.comments)
        .set({ readByAi: true })
        .where(inArray(schema.comments.id, unreadIds));
    }
  }
  return rows;
}

export async function addComment(db: Database, input: AddCommentInput) {
  const parsed = addCommentInput.parse(input);
  const [row] = await db
    .insert(schema.comments)
    .values({
      id: createId("cmt"),
      cardId: parsed.cardId,
      author: parsed.author,
      bodyMd: parsed.bodyMd,
      readByAi: parsed.author === "ai",
    })
    .returning();
  if (row) {
    const [card] = await db
      .select({ projectId: schema.cards.projectId })
      .from(schema.cards)
      .where(eq(schema.cards.id, row.cardId))
      .limit(1);
    if (card) {
      await notify(db, {
        type: "comment.added",
        projectId: card.projectId,
        cardId: row.cardId,
        commentId: row.id,
      });
    }
  }
  return row;
}

export async function listUnreadCommentsForProject(
  db: Database,
  projectId: string,
) {
  return db
    .select({
      id: schema.comments.id,
      cardId: schema.comments.cardId,
      bodyMd: schema.comments.bodyMd,
      createdAt: schema.comments.createdAt,
      cardTitle: schema.cards.title,
    })
    .from(schema.comments)
    .innerJoin(schema.cards, eq(schema.cards.id, schema.comments.cardId))
    .where(
      and(
        eq(schema.cards.projectId, projectId),
        eq(schema.comments.author, "user"),
        eq(schema.comments.readByAi, false),
      ),
    )
    .orderBy(asc(schema.comments.createdAt));
}

export async function markCommentsAsRead(db: Database, commentIds: string[]) {
  if (!commentIds.length) return 0;
  const rows = await db
    .update(schema.comments)
    .set({ readByAi: true })
    .where(inArray(schema.comments.id, commentIds))
    .returning({ id: schema.comments.id });
  return rows.length;
}
