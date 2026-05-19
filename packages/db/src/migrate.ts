import { migrate } from "drizzle-orm/postgres-js/migrator";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createDb } from "./client";

try {
  loadEnvFile(resolve(fileURLToPath(import.meta.url), "../../../../.env"));
} catch {
  // env file optional, falls back to process env
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required to run migrations");
  process.exit(1);
}

const { db, close } = createDb({ url, max: 1 });

try {
  await migrate(db, { migrationsFolder: "./migrations" });
  console.log("Migrations applied");
} catch (err) {
  console.error("Migration failed:", err);
  process.exitCode = 1;
} finally {
  await close();
}
