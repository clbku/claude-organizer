import { relations, sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp
} from 'drizzle-orm/pg-core'

import { cards } from './cards'
import { intakeItems } from './intakeItems'
import { projects } from './projects'

// Files attached to a card or an intake item. Bytes live on disk (a Docker
// volume); only metadata is stored here. `size` is the byte count after
// server-side image compression. `storage_path` is relative to ATTACHMENTS_DIR.
//
// Ownership: at most one of `card_id` / `intake_item_id` is set (enforced by
// `attachments_owner_check`). Both null = a staged upload — a file uploaded
// while composing an intake item that doesn't exist yet; `project_id` (always
// set) anchors it until association or the staging sweep removes it.
export const attachments = pgTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    cardId: text('card_id').references(() => cards.id, { onDelete: 'cascade' }),
    intakeItemId: text('intake_item_id').references(() => intakeItems.id, {
      onDelete: 'cascade'
    }),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    storagePath: text('storage_path').notNull(),
    uploaderLabel: text('uploader_label'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`)
  },
  t => [
    index('attachments_card_idx').on(t.cardId),
    index('attachments_intake_idx').on(t.intakeItemId),
    index('attachments_project_idx').on(t.projectId),
    check(
      'attachments_owner_check',
      sql`NOT ("card_id" IS NOT NULL AND "intake_item_id" IS NOT NULL)`
    )
  ]
)

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  card: one(cards, {
    fields: [attachments.cardId],
    references: [cards.id]
  }),
  intakeItem: one(intakeItems, {
    fields: [attachments.intakeItemId],
    references: [intakeItems.id]
  }),
  project: one(projects, {
    fields: [attachments.projectId],
    references: [projects.id]
  })
}))
