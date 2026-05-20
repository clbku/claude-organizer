import type { FastifyInstance } from "fastify";
import type { Database } from "@claude-organizer/db";
import {
  archiveDoc,
  createDoc,
  destroyDoc,
  getDoc,
  listDocs,
  restoreDoc,
  searchDocs,
  updateDoc,
} from "@claude-organizer/core";

export function registerDocRoutes(app: FastifyInstance, db: Database) {
  app.get<{
    Querystring: {
      projectId: string;
      kind?: string;
      q?: string;
      includeArchived?: string;
      archivedOnly?: string;
    };
  }>("/docs", async (req) => {
    const { projectId, kind, q, includeArchived, archivedOnly } = req.query;
    if (q) return searchDocs(db, projectId, q);
    return listDocs(db, projectId, kind as never, {
      includeArchived: includeArchived === "true",
      archivedOnly: archivedOnly === "true",
    });
  });

  app.get<{ Params: { id: string } }>("/docs/:id", async (req, reply) => {
    const doc = await getDoc(db, req.params.id);
    if (!doc) return reply.code(404).send({ error: "not_found" });
    return doc;
  });

  app.post("/docs", async (req, reply) => {
    try {
      return await createDoc(db, req.body as never);
    } catch (err) {
      reply.code(400);
      return { error: (err as Error).message };
    }
  });

  app.patch<{ Params: { id: string } }>("/docs/:id", async (req, reply) => {
    try {
      return await updateDoc(db, {
        ...(req.body as object),
        id: req.params.id,
      } as never);
    } catch (err) {
      reply.code(400);
      return { error: (err as Error).message };
    }
  });

  app.post<{ Params: { id: string } }>(
    "/docs/:id/archive",
    async (req) => archiveDoc(db, req.params.id),
  );

  app.post<{ Params: { id: string } }>(
    "/docs/:id/restore",
    async (req) => restoreDoc(db, req.params.id),
  );

  app.delete<{ Params: { id: string } }>("/docs/:id", async (req, reply) => {
    const destroyed = await destroyDoc(db, req.params.id);
    if (!destroyed) return reply.code(404).send({ error: "not_found" });
    return { deleted: true };
  });
}
