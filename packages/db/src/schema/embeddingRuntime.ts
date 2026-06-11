import { sql } from 'drizzle-orm'
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// One row, written by the dedicated embedding service (the single process that
// loads the model — keyed `service='embedding'`). It records the model/dim the
// service actually has loaded after each (re)load, so getEmbeddingStatus can
// surface it as `serviceModel`. `model` is null when embeddings are disabled.
export const embeddingRuntime = pgTable('embedding_runtime', {
  service: text('service').primaryKey(),
  model: text('model'),
  dim: integer('dim').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`)
})
