import { relations, sql } from 'drizzle-orm'
import { index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

import { attachments } from './attachments'
import { attachmentOwnerTypeEnum } from './enums'

// Derived index of which item bodies reference each attachment — the markdown is
// still the source of truth, this table is reconciled on every write and is
// rebuildable from the bodies (so it stays OUT of the backup). `itemId` is
// polymorphic across card/comment/doc/inbox (same four as the owner-link), hence
// no FK on it. The two indices serve the two read directions: count an
// attachment's links, and reconcile a single item's links.
export const attachmentLinks = pgTable(
  'attachment_links',
  {
    attachmentId: text('attachment_id')
      .notNull()
      .references(() => attachments.id, { onDelete: 'cascade' }),
    itemType: attachmentOwnerTypeEnum('item_type').notNull(),
    itemId: text('item_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`)
  },
  t => [
    primaryKey({ columns: [t.attachmentId, t.itemType, t.itemId] }),
    index('attachment_links_item_idx').on(t.itemType, t.itemId)
  ]
)

export const attachmentLinksRelations = relations(attachmentLinks, ({ one }) => ({
  attachment: one(attachments, {
    fields: [attachmentLinks.attachmentId],
    references: [attachments.id]
  })
}))
