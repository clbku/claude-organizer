import type { FastifyInstance } from "fastify";
import type { Database } from "@claude-organizer/db";
import {
  addComment,
  deleteComment,
  listComments,
  listUnreadCommentsForProject,
  markCommentsAsRead,
} from "@claude-organizer/core";

export function registerCommentRoutes(app: FastifyInstance, db: Database) {
  app.get<{
    Params: { cardId: string };
    Querystring: { markAsRead?: string };
  }>("/cards/:cardId/comments", async (req) => {
    return listComments(db, req.params.cardId, {
      markAsRead: req.query.markAsRead === "true",
    });
  });

  app.post<{ Params: { cardId: string } }>(
    "/cards/:cardId/comments",
    async (req, reply) => {
      try {
        const body = req.body as { bodyMd: string; author?: "ai" | "user" };
        return await addComment(db, {
          cardId: req.params.cardId,
          author: body.author ?? "user",
          bodyMd: body.bodyMd,
        });
      } catch (err) {
        reply.code(400);
        return { error: (err as Error).message };
      }
    },
  );

  app.get<{ Querystring: { projectId: string } }>(
    "/comments/unread",
    async (req) => listUnreadCommentsForProject(db, req.query.projectId),
  );

  app.post<{ Body: { commentIds: string[] } }>(
    "/comments/read",
    async (req) => {
      const updated = await markCommentsAsRead(db, req.body.commentIds);
      return { updated };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/comments/:id",
    async (req, reply) => {
      const deleted = await deleteComment(db, req.params.id);
      if (!deleted) {
        reply.code(404);
        return { error: "Comment not found" };
      }
      return { ok: true };
    },
  );
}
