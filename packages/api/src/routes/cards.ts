import type { FastifyInstance } from "fastify";
import type { Database } from "@claude-organizer/db";
import {
  archiveCard,
  createCard,
  destroyCard,
  getCard,
  getCardByKey,
  listCards,
  restoreCard,
  updateCard,
} from "@claude-organizer/core";

export function registerCardRoutes(app: FastifyInstance, db: Database) {
  app.get<{
    Querystring: {
      projectId: string;
      sprintId?: string;
      status?: string;
      backlogOnly?: string;
      includeArchived?: string;
      archivedOnly?: string;
    };
  }>("/cards", async (req) => {
    const { projectId, sprintId, status, backlogOnly, includeArchived, archivedOnly } =
      req.query;
    return listCards(db, {
      projectId,
      sprintId: sprintId === "null" ? null : sprintId,
      status: status as never,
      backlogOnly: backlogOnly === "true",
      includeArchived: includeArchived === "true",
      archivedOnly: archivedOnly === "true",
    });
  });

  app.get<{ Params: { key: string } }>(
    "/cards/by-key/:key",
    async (req, reply) => {
      const card = await getCardByKey(db, req.params.key);
      if (!card) return reply.code(404).send({ error: "not_found" });
      return card;
    },
  );

  app.get<{ Params: { id: string } }>("/cards/:id", async (req, reply) => {
    const card = await getCard(db, req.params.id);
    if (!card) return reply.code(404).send({ error: "not_found" });
    return card;
  });

  app.post("/cards", async (req, reply) => {
    try {
      return await createCard(db, req.body as never);
    } catch (err) {
      reply.code(400);
      return { error: (err as Error).message };
    }
  });

  app.patch<{ Params: { id: string } }>("/cards/:id", async (req, reply) => {
    try {
      return await updateCard(db, {
        ...(req.body as object),
        id: req.params.id,
      } as never);
    } catch (err) {
      reply.code(400);
      return { error: (err as Error).message };
    }
  });

  app.post<{ Params: { id: string } }>(
    "/cards/:id/archive",
    async (req) => archiveCard(db, req.params.id),
  );

  app.post<{ Params: { id: string } }>(
    "/cards/:id/restore",
    async (req) => restoreCard(db, req.params.id),
  );

  app.delete<{ Params: { id: string } }>("/cards/:id", async (req, reply) => {
    const destroyed = await destroyCard(db, req.params.id);
    if (!destroyed) return reply.code(404).send({ error: "not_found" });
    return { deleted: true };
  });
}
