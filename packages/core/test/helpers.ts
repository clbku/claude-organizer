import { afterAll, beforeAll, inject } from "vitest";
import { createDb, type Database } from "@claude-organizer/db";
import { createProject } from "../src/index";

export interface TestDb {
  db: Database;
}

/**
 * Opens a connection to the suite's ephemeral Postgres for the current test
 * file and closes it afterwards. Call at the top level of a test file.
 */
export function useTestDb(): TestDb {
  const ctx: TestDb = {} as TestDb;
  let close: () => Promise<void>;

  beforeAll(() => {
    const conn = createDb({ url: inject("databaseUrl") });
    ctx.db = conn.db;
    close = conn.close;
  });

  afterAll(async () => {
    await close();
  });

  return ctx;
}

let seq = 0;

/** Create an isolated project so each test operates in its own namespace. */
export function freshProject(db: Database, keyPrefix = "CO") {
  seq += 1;
  const suffix = `${Date.now().toString(36)}${seq}`;
  return createProject(db, {
    name: `Test Project ${suffix}`,
    slug: `test-${suffix}`,
    keyPrefix,
  });
}
