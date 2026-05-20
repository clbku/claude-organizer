import type { FastifyInstance } from "fastify";
import type { Database } from "@claude-organizer/db";
import {
  addTagToCard,
  createTag,
  deleteTag,
  listTags,
  removeTagFromCard,
  updateTag,
} from "@claude-organizer/core";

export function registerTagRoutes(app: FastifyInstance, db: Database) {
  app.get<{ Querystring: { projectId: string } }>(
    "/tags",
    async (req) => listTags(db, req.query.projectId),
  );

  app.post("/tags", async (req, reply) => {
    try {
      return await createTag(db, req.body as never);
    } catch (err) {
      reply.code(400);
      return { error: (err as Error).message };
    }
  });

  app.patch<{ Params: { tagId: string } }>(
    "/tags/:tagId",
    async (req, reply) => {
      try {
        return await updateTag(db, {
          ...(req.body as object),
          id: req.params.tagId,
        } as never);
      } catch (err) {
        reply.code(400);
        return { error: (err as Error).message };
      }
    },
  );

  app.delete<{ Params: { tagId: string } }>(
    "/tags/:tagId",
    async (req) => deleteTag(db, req.params.tagId),
  );

  app.post<{ Params: { cardId: string; tagId: string } }>(
    "/cards/:cardId/tags/:tagId",
    async (req) => addTagToCard(db, req.params.cardId, req.params.tagId),
  );

  app.delete<{ Params: { cardId: string; tagId: string } }>(
    "/cards/:cardId/tags/:tagId",
    async (req) => removeTagFromCard(db, req.params.cardId, req.params.tagId),
  );
}
