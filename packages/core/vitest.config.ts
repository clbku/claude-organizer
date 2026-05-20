import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/global-setup.ts"],
    // Single Postgres container shared by the whole suite; one worker keeps DB
    // access deterministic and avoids a connection storm.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    // Container startup + migrations can take a few seconds on a cold image.
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
