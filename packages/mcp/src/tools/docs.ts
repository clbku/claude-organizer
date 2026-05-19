import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createDoc,
  deleteDoc,
  getDoc,
  listDocs,
  searchDocs,
  updateDoc,
} from "@claude-organizer/core";
import type { Database } from "@claude-organizer/db";
import { asJson } from "./index";

const docKind = z.enum(["module", "adr", "guide", "note"]);

export function registerDocTools(server: McpServer, db: Database) {
  server.tool(
    "list_docs",
    "List project docs (modules, ADRs, guides, notes). Returns metadata (id/title/kind/parentId) WITHOUT bodyMd. Use read_doc for full content. Optionally filter by kind.",
    {
      projectId: z.string(),
      kind: docKind.optional(),
    },
    async ({ projectId, kind }) => asJson(await listDocs(db, projectId, kind)),
  );

  server.tool(
    "read_doc",
    "Read a single doc by id, including full bodyMd (markdown).",
    { id: z.string() },
    async ({ id }) => asJson(await getDoc(db, id)),
  );

  server.tool(
    "search_docs",
    "Search docs of a project by title or body content (case-insensitive substring).",
    { projectId: z.string(), query: z.string().min(1) },
    async ({ projectId, query }) =>
      asJson(await searchDocs(db, projectId, query)),
  );

  server.tool(
    "write_doc",
    "Create a new doc, or update an existing one if `id` is provided. Use `kind` to classify: module (a code domain/area), adr (architecture decision record), guide (how-to), note (anything else). `parentId` nests the doc under another. `summary` is a one-line description shown in lists.",
    {
      id: z.string().optional(),
      projectId: z.string().optional(),
      parentId: z.string().nullable().optional(),
      title: z.string().min(1).max(200).optional(),
      summary: z.string().max(200).optional(),
      bodyMd: z.string().optional(),
      kind: docKind.optional(),
    },
    async (input) => {
      if (input.id) {
        return asJson(
          await updateDoc(db, {
            id: input.id,
            title: input.title,
            summary: input.summary,
            bodyMd: input.bodyMd,
            kind: input.kind,
            parentId: input.parentId,
          }),
        );
      }
      if (!input.projectId || !input.title) {
        throw new Error("projectId and title are required to create a doc");
      }
      return asJson(
        await createDoc(db, {
          projectId: input.projectId,
          parentId: input.parentId,
          title: input.title,
          summary: input.summary,
          bodyMd: input.bodyMd,
          kind: input.kind,
        }),
      );
    },
  );

  server.tool(
    "delete_doc",
    "Delete a doc (and its children, via cascade) by id.",
    { id: z.string() },
    async ({ id }) => asJson(await deleteDoc(db, id)),
  );
}
