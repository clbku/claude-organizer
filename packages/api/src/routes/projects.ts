import type { FastifyInstance } from "fastify";
import type { Database } from "@claude-organizer/db";
import {
  createProject,
  getProjectBySlug,
  listProjects,
} from "@claude-organizer/core";

export function registerProjectRoutes(app: FastifyInstance, db: Database) {
  app.get("/projects", async () => listProjects(db));

  app.get<{ Params: { slug: string } }>(
    "/projects/:slug",
    async (req, reply) => {
      const project = await getProjectBySlug(db, req.params.slug);
      if (!project) return reply.code(404).send({ error: "not_found" });
      return project;
    },
  );

  app.post("/projects", async (req, reply) => {
    try {
      return await createProject(db, req.body as never);
    } catch (err) {
      reply.code(400);
      return { error: (err as Error).message };
    }
  });
}
