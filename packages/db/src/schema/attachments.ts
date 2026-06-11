import { relations, sql } from 'drizzle-orm'
import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { bytea } from './columns'
import { projects } from './projects'

// An attachment belongs to its project (FK cascade); where it's referenced is
// tracked by the derived `attachment_links` index, the single source of truth for
// the attachment↔item relation. The markdown reference in a body is what a link
// reflects. `data` is nullable so a backup exported with includeAttachmentsInBackup
// OFF can round-trip the metadata while leaving the bytes out.
export const attachments = pgTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    mime: text('mime').notNull(),
    filename: text('filename'),
    byteSize: integer('byte_size').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    description: text('description'),
    data: bytea('data'),
    // When the attachment dropped to 0 links — the grace-window clock for the
    // deferred edit-orphan sweep; null = has links or not yet evaluated.
    orphanedAt: timestamp('orphaned_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`)
  },
  t => [
    index('attachments_project_idx').on(t.projectId),
    // Partial — the sweep only ever scans orphaned rows (orphaned_at < now() -
    // grace), so the NULL majority (every linked attachment) stays out of the index.
    index('attachments_orphaned_idx')
      .on(t.orphanedAt)
      .where(sql`${t.orphanedAt} is not null`)
  ]
)

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  project: one(projects, {
    fields: [attachments.projectId],
    references: [projects.id]
  })
}))
