import { relations, sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { intakeStatusEnum } from './enums'
import { projects } from './projects'

export const intakeItems = pgTable(
  'intake_items',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    bodyMd: text('body_md').notNull(),
    status: intakeStatusEnum('status').notNull().default('pending'),
    plannedCardKeys: text('planned_card_keys'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    archivedAt: timestamp('archived_at', { withTimezone: true })
  },
  t => [
    index('intake_items_project_idx').on(t.projectId),
    index('intake_items_status_idx').on(t.projectId, t.status)
  ]
)

export const intakeItemsRelations = relations(intakeItems, ({ one }) => ({
  project: one(projects, {
    fields: [intakeItems.projectId],
    references: [projects.id]
  })
}))
