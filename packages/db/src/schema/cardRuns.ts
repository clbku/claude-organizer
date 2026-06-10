import { relations, sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { cards } from './cards'
import { cardRunStatusEnum } from './enums'
import { projects } from './projects'

// One auto-implement runner execution for a card (CO-26). A card can be run
// several times over its life, and each run carries its own worktree/branch and
// failure reason, so this is its own table rather than columns on `cards`. The
// `running` rows are the source of truth for the per-project concurrency guard
// and for the boot-time sweep that reaps runs orphaned by a dead process.
export const cardRuns = pgTable(
  'card_runs',
  {
    id: text('id').primaryKey(),
    cardId: text('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    status: cardRunStatusEnum('status').notNull().default('running'),
    // The AI execution port's jobId (the claude adapter's OS pid) — lets a cancel
    // or a boot-time sweep reap a run whose process outlived its row. Internal,
    // not part of the API wire contract (mirrors intakeItems.subprocessId).
    jobId: text('job_id'),
    worktreePath: text('worktree_path'),
    branch: text('branch'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`)
  },
  t => [
    index('card_runs_card_idx').on(t.cardId),
    index('card_runs_project_status_idx').on(t.projectId, t.status)
  ]
)

export const cardRunsRelations = relations(cardRuns, ({ one }) => ({
  card: one(cards, { fields: [cardRuns.cardId], references: [cards.id] }),
  project: one(projects, {
    fields: [cardRuns.projectId],
    references: [projects.id]
  })
}))
