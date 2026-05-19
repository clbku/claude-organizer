import type { FastifyInstance } from "fastify";
import type { Database } from "@claude-organizer/db";
import {
  completeSprint,
  createSprint,
  getActiveSprint,
  listSprints,
  startSprint,
} from "@claude-organizer/core";

export function registerSprintRoutes(app: FastifyInstance, db: Database) {
  app.get<{ Querystring: { projectId: string } }>(
    "/sprints",
    async (req) => listSprints(db, req.query.projectId),
  );

  app.get<{ Querystring: { projectId: string } }>(
    "/sprints/active",
    async (req) => getActiveSprint(db, req.query.projectId),
  );

  app.post("/sprints", async (req, reply) => {
    try {
      return await createSprint(db, req.body as never);
    } catch (err) {
      reply.code(400);
      return { error: (err as Error).message };
    }
  });

  app.post<{ Params: { id: string } }>(
    "/sprints/:id/start",
    async (req) => startSprint(db, req.params.id),
  );

  app.post<{ Params: { id: string } }>(
    "/sprints/:id/complete",
    async (req) => completeSprint(db, req.params.id),
  );
}
