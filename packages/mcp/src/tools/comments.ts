import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  addComment,
  listComments,
  listUnreadCommentsForProject,
  markCommentsAsRead,
} from "@claude-organizer/core";
import type { Database } from "@claude-organizer/db";
import { asJson } from "./index";

export function registerCommentTools(server: McpServer, db: Database) {
  server.tool(
    "list_comments",
    "List comments of a card. By default, marks user comments as read by AI.",
    {
      cardId: z.string(),
      markAsRead: z.boolean().optional().default(true),
    },
    async ({ cardId, markAsRead }) =>
      asJson(await listComments(db, cardId, { markAsRead })),
  );

  server.tool(
    "list_unread_comments",
    "List all user comments not yet read by the AI for a project. Does NOT mark them as read.",
    { projectId: z.string() },
    async ({ projectId }) =>
      asJson(await listUnreadCommentsForProject(db, projectId)),
  );

  server.tool(
    "add_comment",
    "Add a comment authored by the AI to a card.",
    {
      cardId: z.string(),
      bodyMd: z.string().min(1),
    },
    async ({ cardId, bodyMd }) =>
      asJson(await addComment(db, { cardId, bodyMd, author: "ai" })),
  );

  server.tool(
    "mark_comments_read",
    "Mark a list of comments as read by the AI.",
    { commentIds: z.array(z.string()).min(1) },
    async ({ commentIds }) => {
      const updated = await markCommentsAsRead(db, commentIds);
      return asJson({ updated });
    },
  );
}
