import type { FastifyInstance } from "fastify";
import type { Database } from "@claude-organizer/db";
import {
  archiveSprint,
  completeSprint,
  createSprint,
  destroySprint,
  getActiveSprint,
  getSprint,
  listSprints,
  restoreSprint,
  startSprint,
  updateSprint,
} from "@claude-organizer/core";

export function registerSprintRoutes(app: FastifyInstance, db: Database) {
  app.get<{
    Querystring: {
      projectId: string;
      includeArchived?: string;
      archivedOnly?: string;
    };
  }>("/sprints", async (req) => {
    const { projectId, includeArchived, archivedOnly } = req.query;
    return listSprints(db, projectId, {
      includeArchived: includeArchived === "true",
      archivedOnly: archivedOnly === "true",
    });
  });

  app.get<{ Querystring: { projectId: string } }>(
    "/sprints/active",
    async (req) => getActiveSprint(db, req.query.projectId),
  );

  app.get<{ Params: { id: string } }>("/sprints/:id", async (req, reply) => {
    const sprint = await getSprint(db, req.params.id);
    if (!sprint) return reply.code(404).send({ error: "not_found" });
    return sprint;
  });

  app.post("/sprints", async (req, reply) => {
    try {
      return await createSprint(db, req.body as never);
    } catch (err) {
      reply.code(400);
      return { error: (err as Error).message };
    }
  });

  app.patch<{ Params: { id: string } }>("/sprints/:id", async (req, reply) => {
    try {
      return await updateSprint(db, {
        ...(req.body as object),
        id: req.params.id,
      } as never);
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

  app.post<{ Params: { id: string } }>(
    "/sprints/:id/archive",
    async (req) => archiveSprint(db, req.params.id),
  );

  app.post<{ Params: { id: string } }>(
    "/sprints/:id/restore",
    async (req) => restoreSprint(db, req.params.id),
  );

  app.delete<{ Params: { id: string } }>("/sprints/:id", async (req, reply) => {
    const destroyed = await destroySprint(db, req.params.id);
    if (!destroyed) return reply.code(404).send({ error: "not_found" });
    return { deleted: true };
  });
}
