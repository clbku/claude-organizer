import type { FastifyInstance } from "fastify";
import type { Database } from "@claude-organizer/db";
import { addBlocker, removeBlocker } from "@claude-organizer/core";

export function registerBlockerRoutes(app: FastifyInstance, db: Database) {
  // `cardId` is the blocked card; `blockerId` is the card that blocks it.
  app.post<{ Params: { cardId: string; blockerId: string } }>(
    "/cards/:cardId/blockers/:blockerId",
    async (req, reply) => {
      try {
        return await addBlocker(db, req.params.cardId, req.params.blockerId);
      } catch (err) {
        reply.code(400);
        return { error: (err as Error).message };
      }
    },
  );

  app.delete<{ Params: { cardId: string; blockerId: string } }>(
    "/cards/:cardId/blockers/:blockerId",
    async (req) => removeBlocker(db, req.params.cardId, req.params.blockerId),
  );
}
