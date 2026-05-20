#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDb } from "@claude-organizer/db";
import { registerTools } from "./tools/index";
import { registerResources } from "./resources/index";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "[claude-organizer-mcp] DATABASE_URL env var is required (see .env.example)",
  );
  process.exit(1);
}

const { db, close } = createDb({ url: databaseUrl, max: 4 });

const server = new McpServer({
  name: "claude-organizer",
  version: "0.0.1",
});

registerTools(server, db);
registerResources(server, db);

const transport = new StdioServerTransport();

const shutdown = async () => {
  await close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await server.connect(transport);
