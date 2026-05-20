import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // One Postgres container is shared by the whole suite via globalSetup.
    // Test files may run in parallel workers; isolation is by data (each test
    // creates its own project), so no special pool config is needed.
    globalSetup: ['./test/global-setup.ts'],
    // Container startup + migrations can take a few seconds on a cold image.
    hookTimeout: 120_000,
    testTimeout: 30_000
  }
})
