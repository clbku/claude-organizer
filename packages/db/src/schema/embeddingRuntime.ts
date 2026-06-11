import { sql } from 'drizzle-orm'
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// One row, written by the dedicated embedding service (the single process that
// loads the model — keyed `service='embedding'`). It records the model/dim/dtype
// the service actually has loaded after each (re)load, so getEmbeddingStatus can
// surface them as `serviceModel`/`serviceDtype`. `model`/`dtype` are null when
// embeddings are disabled.
export const embeddingRuntime = pgTable('embedding_runtime', {
  service: text('service').primaryKey(),
  model: text('model'),
  dim: integer('dim').notNull(),
  dtype: text('dtype'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`)
})
