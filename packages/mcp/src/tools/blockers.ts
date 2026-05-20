import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { addBlocker, removeBlocker } from "@claude-organizer/core";
import type { Database } from "@claude-organizer/db";
import { asJson } from "./index";

export function registerBlockerTools(server: McpServer, db: Database) {
  server.tool(
    "add_blocker",
    "Mark a card as blocked by another. `cardId` is the blocked card; `blockerId` is the card that must be resolved first. A card cannot block itself. Returns the blocked card's blockers.",
    { cardId: z.string(), blockerId: z.string() },
    async ({ cardId, blockerId }) =>
      asJson(await addBlocker(db, cardId, blockerId)),
  );

  server.tool(
    "remove_blocker",
    "Remove a blocking dependency so `blockerId` no longer blocks `cardId`.",
    { cardId: z.string(), blockerId: z.string() },
    async ({ cardId, blockerId }) =>
      asJson(await removeBlocker(db, cardId, blockerId)),
  );
}
