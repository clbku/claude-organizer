import { Buffer } from 'node:buffer'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { desc, eq, inArray, sql } from 'drizzle-orm'
import sharp from 'sharp'

import { createId, type Database, schema } from '@claude-organizer/db'

import { InputError } from './errors'
import { notify } from './events'

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

// Thrown when a card is moved to `done` with no proof-of-work attached. The
// exact wording is part of the contract (the web surfaces it verbatim).
export const PROOF_OF_WORK_REQUIRED
  = 'Proof of work required: attach at least one file before closing this card.'

let cachedDir: string | null = null

/**
 * Root directory for attachment bytes. `ATTACHMENTS_DIR` wins (set to a mounted
 * volume in Docker); otherwise a temp dir in dev so local runs never litter the
 * repo, and `./data/attachments` in production as a last resort.
 */
export function attachmentsDir(): string {
  if (!cachedDir) {
    cachedDir
      = process.env.ATTACHMENTS_DIR
        ?? (process.env.NODE_ENV === 'production'
          ? path.resolve('data/attachments')
          : path.join(tmpdir(), 'claude-organizer-attachments'))
  }
  return cachedDir
}

export interface CreateAttachmentInput {
  cardId: string
  filename: string
  mimeType: string
  bytes: Buffer
  uploaderLabel?: string | null
}

// Keep the on-disk name free of path separators / traversal; the DB still holds
// the original `filename` for display and downloads.
function diskName(id: string, filename: string): string {
  const base = path.basename(filename).replace(/[^\w.-]+/g, '_')
  return `${id}-${base || 'file'}`
}

/**
 * Shrink an image below the size ceiling: auto-orient, then resize down through
 * a ladder of max edges, keeping the input format. Returns the original bytes
 * untouched if sharp can't decode them (the caller's size guard still applies).
 */
async function compressImage(bytes: Buffer): Promise<Buffer> {
  let smallest = bytes
  try {
    for (const edge of [2560, 1920, 1280, 960]) {
      const out = await sharp(bytes, { failOn: 'none', animated: true })
        .rotate()
        .resize(edge, edge, { fit: 'inside', withoutEnlargement: true })
        .toBuffer()
      smallest = out
      if (out.byteLength <= MAX_ATTACHMENT_BYTES) return out
    }
  } catch {
    return bytes
  }
  return smallest
}

export async function createAttachment(db: Database, input: CreateAttachmentInput) {
  const [card] = await db
    .select({
      id: schema.cards.id,
      projectId: schema.cards.projectId,
      key: schema.cards.key
    })
    .from(schema.cards)
    .where(eq(schema.cards.id, input.cardId))
    .limit(1)
  if (!card) {
    throw new InputError(`Card ${input.cardId} not found`)
  }

  let bytes = input.bytes
  if (input.mimeType.startsWith('image/')) {
    bytes = await compressImage(bytes)
  }
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new InputError(
      `Attachment exceeds the ${MAX_ATTACHMENT_BYTES / (1024 * 1024)}MB limit after compression`
    )
  }

  const id = createId('att')
  const storagePath = path.join(card.id, diskName(id, input.filename))
  const abs = path.join(attachmentsDir(), storagePath)
  await mkdir(path.dirname(abs), { recursive: true })
  await writeFile(abs, bytes)

  let row
  try {
    ;[row] = await db
      .insert(schema.cardAttachments)
      .values({
        id,
        cardId: card.id,
        filename: input.filename,
        mimeType: input.mimeType,
        size: bytes.byteLength,
        storagePath,
        uploaderLabel: input.uploaderLabel ?? null
      })
      .returning()
  } catch (err) {
    // Don't leave the just-written file orphaned if the row never lands.
    await rm(abs, { force: true }).catch(() => {})
    throw err
  }

  await notify(db, {
    type: 'card.changed',
    projectId: card.projectId,
    cardId: card.id,
    cardKey: card.key
  })
  return row
}

export async function listCardAttachments(db: Database, cardId: string) {
  return db
    .select()
    .from(schema.cardAttachments)
    .where(eq(schema.cardAttachments.cardId, cardId))
    .orderBy(desc(schema.cardAttachments.createdAt))
}

export async function getAttachment(db: Database, id: string) {
  const [row] = await db
    .select()
    .from(schema.cardAttachments)
    .where(eq(schema.cardAttachments.id, id))
    .limit(1)
  return row ?? null
}

export async function deleteAttachment(db: Database, id: string) {
  const [row] = await db
    .delete(schema.cardAttachments)
    .where(eq(schema.cardAttachments.id, id))
    .returning()
  if (!row) return null
  // Best-effort disk cleanup: a missing file must not fail the delete.
  await rm(path.join(attachmentsDir(), row.storagePath), { force: true }).catch(
    () => {}
  )
  const [card] = await db
    .select({ projectId: schema.cards.projectId, key: schema.cards.key })
    .from(schema.cards)
    .where(eq(schema.cards.id, row.cardId))
    .limit(1)
  if (card) {
    await notify(db, {
      type: 'card.changed',
      projectId: card.projectId,
      cardId: row.cardId,
      cardKey: card.key
    })
  }
  return row
}

export async function hasAttachments(db: Database, cardId: string): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.cardAttachments)
    .where(eq(schema.cardAttachments.cardId, cardId))
  return (row?.count ?? 0) > 0
}

export async function attachmentCountsByCardIds(
  db: Database,
  ids: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (ids.length === 0) return map
  const rows = await db
    .select({
      cardId: schema.cardAttachments.cardId,
      count: sql<number>`count(*)::int`
    })
    .from(schema.cardAttachments)
    .where(inArray(schema.cardAttachments.cardId, ids))
    .groupBy(schema.cardAttachments.cardId)
  for (const r of rows) map.set(r.cardId, r.count)
  return map
}
