import type { FastifyInstance } from "fastify";
import type { Database } from "@claude-organizer/db";
import {
  createCard,
  getCard,
  getCardByKey,
  listCards,
  updateCard,
} from "@claude-organizer/core";

export function registerCardRoutes(app: FastifyInstance, db: Database) {
  app.get<{
    Querystring: {
      projectId: string;
      sprintId?: string;
      status?: string;
      backlogOnly?: string;
    };
  }>("/cards", async (req) => {
    const { projectId, sprintId, status, backlogOnly } = req.query;
    return listCards(db, {
      projectId,
      sprintId: sprintId === "null" ? null : sprintId,
      status: status as never,
      backlogOnly: backlogOnly === "true",
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
}
