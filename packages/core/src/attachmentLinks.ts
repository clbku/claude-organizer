import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'

import { type Database, schema } from '@claude-organizer/db'
import type { AttachmentOwnerType } from '@claude-organizer/shared'

import { attachmentIdsInBody } from './attachments'

// item_type reuses the attachment owner types (card|comment|doc|inbox).
export type AttachmentItemType = AttachmentOwnerType

// Reconciles the derived link index for one item against its markdown: the body
// is the source of truth, so we insert the tokens it now cites and delete the
// links whose token left the body. Idempotent — same body twice is a no-op. Runs
// in the caller's transaction (pass the tx) so a link never diverges from the
// persisted body. Also the basis for the backup rebuild on import.
export async function reconcileAttachmentLinks(
  db: Database,
  itemType: AttachmentItemType,
  itemId: string,
  bodyMd: string | null | undefined
): Promise<void> {
  const desired = new Set(attachmentIdsInBody(bodyMd))
  const existing = new Set(
    (
      await db
        .select({ attachmentId: schema.attachmentLinks.attachmentId })
        .from(schema.attachmentLinks)
        .where(
          and(
            eq(schema.attachmentLinks.itemType, itemType),
            eq(schema.attachmentLinks.itemId, itemId)
          )
        )
    ).map(r => r.attachmentId)
  )

  const toAdd = [...desired].filter(id => !existing.has(id))
  const toRemove = [...existing].filter(id => !desired.has(id))
  if (!toAdd.length && !toRemove.length) return

  if (toAdd.length) {
    // FK-safe: only link tokens that resolve to a real attachment (a dangling
    // ref — e.g. pasted markdown citing a foreign id — would trip the FK).
    const valid = (
      await db
        .select({ id: schema.attachments.id })
        .from(schema.attachments)
        .where(inArray(schema.attachments.id, toAdd))
    ).map(r => r.id)
    if (valid.length)
      await db
        .insert(schema.attachmentLinks)
        .values(valid.map(attachmentId => ({ attachmentId, itemType, itemId })))
        .onConflictDoNothing()
  }

  if (toRemove.length)
    await db
      .delete(schema.attachmentLinks)
      .where(
        and(
          eq(schema.attachmentLinks.itemType, itemType),
          eq(schema.attachmentLinks.itemId, itemId),
          inArray(schema.attachmentLinks.attachmentId, toRemove)
        )
      )

  await refreshOrphanedAt(db, [...new Set([...toAdd, ...toRemove])])
}

// Re-derives `orphaned_at` from the actual current link count for the touched
// attachments (not from toAdd/toRemove), so it's correct under concurrency: a
// row that just hit 0 links and has no clock yet starts it; one that has links
// again clears it (an undo inside the grace window cancels the sweep).
async function refreshOrphanedAt(
  db: Database,
  attachmentIds: string[]
): Promise<void> {
  if (!attachmentIds.length) return
  const hasLink = sql`exists (select 1 from ${schema.attachmentLinks} where ${schema.attachmentLinks.attachmentId} = ${schema.attachments.id})`
  await db
    .update(schema.attachments)
    .set({ orphanedAt: sql`now()` })
    .where(
      and(
        inArray(schema.attachments.id, attachmentIds),
        isNull(schema.attachments.orphanedAt),
        sql`not ${hasLink}`
      )
    )
  await db
    .update(schema.attachments)
    .set({ orphanedAt: null })
    .where(
      and(
        inArray(schema.attachments.id, attachmentIds),
        isNotNull(schema.attachments.orphanedAt),
        hasLink
      )
    )
}
