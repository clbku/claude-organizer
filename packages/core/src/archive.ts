import { isNotNull, isNull, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

/** Filter for soft-deleted (archived) rows. Default behavior hides archived. */
export interface ArchiveFilter {
  /** Include archived rows alongside active ones. */
  includeArchived?: boolean
  /** Return ONLY archived rows. Takes precedence over `includeArchived`. */
  archivedOnly?: boolean
}

/**
 * SQL condition for an `archivedAt` column derived from an ArchiveFilter:
 * - default (no flags): hide archived (`archivedAt IS NULL`)
 * - `archivedOnly`: only archived (`archivedAt IS NOT NULL`)
 * - `includeArchived`: no condition (returns `undefined`)
 */
export function archivedCondition(
  column: PgColumn,
  filter?: ArchiveFilter
): SQL | undefined {
  if (filter?.archivedOnly) return isNotNull(column)
  if (filter?.includeArchived) return undefined
  return isNull(column)
}
