import { eq, sql } from 'drizzle-orm'

import { type Database, schema } from '@claude-organizer/db'
import type { EmbeddingConfig } from '@claude-organizer/shared'
import { resolveEmbeddingConfig } from '@claude-organizer/shared'

import { getSystemSettings } from './authz'

/**
 * The embedding config the process should run with: the persisted DB choice wins
 * over `EMBEDDING_MODEL`, which wins over the default. Resolved with a db handle
 * (the embedding service reads it at boot/reload; the apply reads it to decide a
 * dim reconcile) — `embed()` itself is a process-global HTTP client with no db.
 */
export async function resolveEffectiveEmbeddingConfig(
  db: Database
): Promise<EmbeddingConfig> {
  const { embeddingModel } = await getSystemSettings(db)
  return resolveEmbeddingConfig(undefined, embeddingModel)
}

/**
 * Record the model/dim a long-lived process actually loaded, so the live status
 * can tell whether it still matches the persisted choice (it can't reset its own
 * singleton mid-run). Call after priming, once per boot.
 */
export async function recordRuntimeEmbeddingConfig(
  db: Database,
  service: string,
  cfg: EmbeddingConfig
): Promise<void> {
  await db
    .insert(schema.embeddingRuntime)
    .values({ service, model: cfg.model, dim: cfg.dim })
    .onConflictDoUpdate({
      target: schema.embeddingRuntime.service,
      set: { model: cfg.model, dim: cfg.dim, updatedAt: sql`now()` }
    })
}

/** The model/dim a process last recorded loading, or null if it never recorded. */
export async function getRuntimeEmbeddingConfig(
  db: Database,
  service: string
): Promise<{ model: string | null, dim: number } | null> {
  const [row] = await db
    .select({
      model: schema.embeddingRuntime.model,
      dim: schema.embeddingRuntime.dim
    })
    .from(schema.embeddingRuntime)
    .where(eq(schema.embeddingRuntime.service, service))
    .limit(1)
  return row ?? null
}

/** Drop a process's marker on graceful shutdown, so a decommissioned process
 * doesn't leave a stale row flagging a restart forever. */
export async function clearRuntimeEmbeddingConfig(
  db: Database,
  service: string
): Promise<void> {
  await db.delete(schema.embeddingRuntime).where(eq(schema.embeddingRuntime.service, service))
}
