import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  addTagToCard,
  createTag,
  listTags,
  removeTagFromCard,
  updateTag,
} from "@claude-organizer/core";
import type { Database } from "@claude-organizer/db";
import { asJson } from "./index";

export function registerTagTools(server: McpServer, db: Database) {
  server.tool(
    "list_tags",
    "List all tags of a project (id, name, color).",
    { projectId: z.string() },
    async ({ projectId }) => asJson(await listTags(db, projectId)),
  );

  server.tool(
    "create_tag",
    "Create a colored tag in a project. `color` is a hex string like #ef4444; defaults to a neutral gray if omitted. Tag names are unique per project.",
    {
      projectId: z.string(),
      name: z.string().min(1).max(50),
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
    },
    async (input) => asJson(await createTag(db, input)),
  );

  server.tool(
    "update_tag",
    "Rename a tag or change its color. Pass the tag id (tag_xxx) plus the fields to change (`name` and/or `color` hex). Affects every card that has the tag.",
    {
      id: z.string(),
      name: z.string().min(1).max(50).optional(),
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
    },
    async (input) => asJson(await updateTag(db, input)),
  );

  server.tool(
    "add_tag_to_card",
    "Attach an existing tag to a card. Returns the card's tags after the change.",
    { cardId: z.string(), tagId: z.string() },
    async ({ cardId, tagId }) => asJson(await addTagToCard(db, cardId, tagId)),
  );

  server.tool(
    "remove_tag_from_card",
    "Remove a tag from a card. Returns the card's tags after the change.",
    { cardId: z.string(), tagId: z.string() },
    async ({ cardId, tagId }) =>
      asJson(await removeTagFromCard(db, cardId, tagId)),
  );
}
