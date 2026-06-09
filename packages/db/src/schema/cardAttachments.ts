import { relations, sql } from 'drizzle-orm'
import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { cards } from './cards'

// Proof-of-work files attached to a card. Bytes live on disk (a Docker volume);
// only metadata is stored here. `size` is the byte count after server-side image
// compression. `storage_path` is relative to ATTACHMENTS_DIR.
export const cardAttachments = pgTable(
  'card_attachments',
  {
    id: text('id').primaryKey(),
    cardId: text('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    storagePath: text('storage_path').notNull(),
    uploaderLabel: text('uploader_label'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`)
  },
  t => [index('card_attachments_card_idx').on(t.cardId)]
)

export const cardAttachmentsRelations = relations(
  cardAttachments,
  ({ one }) => ({
    card: one(cards, {
      fields: [cardAttachments.cardId],
      references: [cards.id]
    })
  })
)
