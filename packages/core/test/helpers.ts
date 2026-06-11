import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, inject } from 'vitest'

import { createDb, type Database, runMigrations } from '@claude-organizer/db'

import { createProject } from '../src/index'

export interface TestDb {
  db: Database
}

export interface UseTestDbOptions {
  /**
   * Provision a dedicated database for this file instead of sharing the suite's
   * primary one. The "isolation by data" the suite relies on (a per-test
   * project) does NOT cover global singletons like `system_settings`, so files
   * that mutate those would race across parallel workers. Opt in to keep their
   * singleton private.
   */
  isolated?: boolean
}

/**
 * Opens a connection to the suite's ephemeral Postgres for the current test
 * file and closes it afterwards. Call at the top level of a test file.
 */
export function useTestDb(options: UseTestDbOptions = {}): TestDb {
  const ctx: TestDb = {} as TestDb
  let close: () => Promise<void>

  beforeAll(async () => {
    const baseUrl = inject('databaseUrl')
    if (!options.isolated) {
      const conn = createDb({ url: baseUrl })
      ctx.db = conn.db
      close = conn.close
      return
    }

    const name = `iso_${randomUUID().replace(/-/g, '').slice(0, 20)}`
    const admin = createDb({ url: baseUrl, max: 1 })
    try {
      await admin.db.execute(sql.raw(`CREATE DATABASE ${name}`))
    } finally {
      await admin.close()
    }

    const url = new URL(baseUrl)
    url.pathname = `/${name}`
    const conn = createDb({ url: url.toString() })
    await runMigrations(conn.db)
    ctx.db = conn.db
    close = conn.close
  })

  afterAll(async () => {
    await close()
  })

  return ctx
}

/**
 * Create an isolated project so each test operates in its own namespace.
 * The slug uses a random UUID so it stays unique even when test files run in
 * parallel workers (Vitest's default).
 */
export function freshProject(db: Database, keyPrefix = 'CO') {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12)
  return createProject(db, {
    name: `Test Project ${suffix}`,
    slug: `test-${suffix}`,
    keyPrefix
  })
}

/**
 * A globally-unique key prefix. Card keys are unique only per project
 * (`cards_project_key_uk`), so a key like `CO-1` repeats across the many
 * default-prefix projects parallel test files create. Tests that resolve a card
 * BY KEY (`attachCardCommit`, `getCardByKey`) must use this, or the lookup may
 * hit another file's same-key card and flake.
 */
export function uniqueKeyPrefix() {
  return `T${randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase()}`
}
