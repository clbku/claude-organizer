import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { migrate } from 'drizzle-orm/postgres-js/migrator'

import type { Database } from './client'

// Resolve the migrations folder relative to this file so it works regardless of
// the caller's cwd (CLI script, tests under vitest, etc.).
const migrationsFolder = resolve(
  fileURLToPath(import.meta.url),
  '../../migrations'
)

export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder })
}
