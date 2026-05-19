import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "@claude-organizer/db";
import { registerProjectTools } from "./projects";
import { registerCardTools } from "./cards";
import { registerSprintTools } from "./sprints";
import { registerCommentTools } from "./comments";
import { registerDocTools } from "./docs";

export function registerTools(server: McpServer, db: Database) {
  registerProjectTools(server, db);
  registerSprintTools(server, db);
  registerCardTools(server, db);
  registerCommentTools(server, db);
  registerDocTools(server, db);
}

export function asJson(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}
