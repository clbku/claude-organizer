import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { createDb } from "@claude-organizer/db";
import eventsPlugin from "./plugins/events";
import { registerProjectRoutes } from "./routes/projects";
import { registerCardRoutes } from "./routes/cards";
import { registerSprintRoutes } from "./routes/sprints";
import { registerCommentRoutes } from "./routes/comments";
import { registerEventsWs } from "./routes/events-ws";

const port = Number(process.env.API_PORT ?? 4400);
const host = process.env.API_HOST ?? "127.0.0.1";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const { db, close } = createDb({ url: databaseUrl });

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(websocket);
await app.register(eventsPlugin);

app.get("/health", async () => ({ status: "ok" }));

app.decorate("db", db);
registerProjectRoutes(app, db);
registerSprintRoutes(app, db);
registerCardRoutes(app, db);
registerCommentRoutes(app, db);
registerEventsWs(app);

const shutdown = async () => {
  await app.close();
  await close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  await app.listen({ port, host });
  app.log.info(`API ready on http://${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
