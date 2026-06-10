import { Buffer } from 'node:buffer'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm'
import sharp from 'sharp'

import { createId, type Database, schema } from '@claude-organizer/db'

import { InputError } from './errors'
import { notify } from './events'

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

// Thrown when a card is moved to `done` with no proof-of-work attached. The
// exact wording is part of the contract (the web surfaces it verbatim).
export const PROOF_OF_WORK_REQUIRED
  = 'Proof of work required: attach at least one file before closing this card.'

// How long an unassociated staged upload survives before the sweep deletes it.
const ttlHours = Number(process.env.ATTACHMENT_STAGING_TTL_HOURS)
const STAGING_TTL_SECS
  = (Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : 24) * 60 * 60

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

/**
 * Exactly one of the three: a card attachment, an intake-item attachment, or a
 * staged upload (composing an intake item that doesn't exist yet).
 */
export type AttachmentOwner
  = | { cardId: string }
    | { intakeItemId: string }
    | { stagingProjectId: string }

export type CreateAttachmentInput = AttachmentOwner & {
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
 * a ladder of max edges, keeping the input format.
 *
 * `failOn: 'truncated'` is deliberate: an incomplete decode (e.g. a base64
 * payload cut short before it reached us) must throw, not be silently
 * re-encoded with a gray fill and stored. Any `image/*` sharp can't fully
 * decode is rejected with a clear `InputError` instead of a broken file.
 */
async function compressImage(bytes: Buffer): Promise<Buffer> {
  let smallest = bytes
  try {
    for (const edge of [2560, 1920, 1280, 960]) {
      const out = await sharp(bytes, { failOn: 'truncated', animated: true })
        .rotate()
        .resize(edge, edge, { fit: 'inside', withoutEnlargement: true })
        .toBuffer()
      smallest = out
      if (out.byteLength <= MAX_ATTACHMENT_BYTES) return out
    }
  } catch {
    throw new InputError(
      'Image could not be decoded — it looks corrupt or truncated. Re-upload the complete file (large images upload more reliably through the web UI).'
    )
  }
  return smallest
}

interface ResolvedOwner {
  projectId: string
  cardId: string | null
  intakeItemId: string | null
  // Subdirectory under ATTACHMENTS_DIR; card files keep the bare `<cardId>/`
  // layout that predates multi-owner support, so existing files stay reachable.
  storageDir: string
  notifyChanged: (db: Database) => Promise<void>
}

// The invariant the schema can't enforce: `project_id` is always derived from
// the owner, never caller-supplied, so authz can trust it for any owner kind.
async function resolveOwner(
  db: Database,
  input: AttachmentOwner
): Promise<ResolvedOwner> {
  if ('cardId' in input) {
    const [card] = await db
      .select({
        id: schema.cards.id,
        projectId: schema.cards.projectId,
        key: schema.cards.key
      })
      .from(schema.cards)
      .where(eq(schema.cards.id, input.cardId))
      .limit(1)
    if (!card) throw new InputError(`Card ${input.cardId} not found`)
    return {
      projectId: card.projectId,
      cardId: card.id,
      intakeItemId: null,
      storageDir: card.id,
      notifyChanged: db =>
        notify(db, {
          type: 'card.changed',
          projectId: card.projectId,
          cardId: card.id,
          cardKey: card.key
        })
    }
  }
  if ('intakeItemId' in input) {
    const [item] = await db
      .select({
        id: schema.intakeItems.id,
        projectId: schema.intakeItems.projectId
      })
      .from(schema.intakeItems)
      .where(eq(schema.intakeItems.id, input.intakeItemId))
      .limit(1)
    if (!item) {
      throw new InputError(`Intake item ${input.intakeItemId} not found`)
    }
    return {
      projectId: item.projectId,
      cardId: null,
      intakeItemId: item.id,
      storageDir: path.join('intake', item.id),
      notifyChanged: db =>
        notify(db, {
          type: 'inbox.changed',
          projectId: item.projectId,
          intakeId: item.id
        })
    }
  }
  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.id, input.stagingProjectId))
    .limit(1)
  if (!project) {
    throw new InputError(`Project ${input.stagingProjectId} not found`)
  }
  return {
    projectId: project.id,
    cardId: null,
    intakeItemId: null,
    storageDir: path.join('staging', project.id),
    // Nothing renders staged uploads except the composer that just made them.
    notifyChanged: async () => {}
  }
}

export async function createAttachment(db: Database, input: CreateAttachmentInput) {
  const owner = await resolveOwner(db, input)

  let bytes = input.bytes
  // Lenient base64 (MCP) or an empty multipart part can decode to zero bytes —
  // a 0-byte file is meaningless proof of work, reject it before touching disk.
  if (bytes.byteLength === 0) {
    throw new InputError('Attachment is empty')
  }
  if (input.mimeType.startsWith('image/')) {
    bytes = await compressImage(bytes)
  }
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new InputError(
      `Attachment exceeds the ${MAX_ATTACHMENT_BYTES / (1024 * 1024)}MB limit after compression`
    )
  }

  const id = createId('att')
  const storagePath = path.join(owner.storageDir, diskName(id, input.filename))
  const abs = path.join(attachmentsDir(), storagePath)
  await mkdir(path.dirname(abs), { recursive: true })
  await writeFile(abs, bytes)

  let row
  try {
    ;[row] = await db
      .insert(schema.attachments)
      .values({
        id,
        projectId: owner.projectId,
        cardId: owner.cardId,
        intakeItemId: owner.intakeItemId,
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

  await owner.notifyChanged(db)
  return row
}

/**
 * Claim staged uploads for a just-created intake item. Only rows that are
 * still staged AND belong to the item's project are touched; any other id is
 * silently skipped. Files stay at their `staging/` path — only ownership
 * changes (the sweep keys off the row, not the directory).
 */
export async function associateStagedAttachments(
  db: Database,
  intakeItemId: string,
  attachmentIds: string[]
) {
  if (attachmentIds.length === 0) return []
  const [item] = await db
    .select({
      id: schema.intakeItems.id,
      projectId: schema.intakeItems.projectId
    })
    .from(schema.intakeItems)
    .where(eq(schema.intakeItems.id, intakeItemId))
    .limit(1)
  if (!item) throw new InputError(`Intake item ${intakeItemId} not found`)

  const rows = await db
    .update(schema.attachments)
    .set({ intakeItemId: item.id })
    .where(
      and(
        inArray(schema.attachments.id, attachmentIds),
        eq(schema.attachments.projectId, item.projectId),
        isNull(schema.attachments.cardId),
        isNull(schema.attachments.intakeItemId)
      )
    )
    .returning()
  if (rows.length > 0) {
    await notify(db, {
      type: 'inbox.changed',
      projectId: item.projectId,
      intakeId: item.id
    })
  }
  return rows
}

export async function listCardAttachments(db: Database, cardId: string) {
  return db
    .select()
    .from(schema.attachments)
    .where(eq(schema.attachments.cardId, cardId))
    .orderBy(desc(schema.attachments.createdAt))
}

export async function listIntakeAttachments(db: Database, intakeItemId: string) {
  return db
    .select()
    .from(schema.attachments)
    .where(eq(schema.attachments.intakeItemId, intakeItemId))
    .orderBy(desc(schema.attachments.createdAt))
}

export async function getAttachment(db: Database, id: string) {
  const [row] = await db
    .select()
    .from(schema.attachments)
    .where(eq(schema.attachments.id, id))
    .limit(1)
  return row ?? null
}

export async function deleteAttachment(db: Database, id: string) {
  const [row] = await db
    .delete(schema.attachments)
    .where(eq(schema.attachments.id, id))
    .returning()
  if (!row) return null
  // Best-effort disk cleanup: a missing file must not fail the delete.
  await rm(path.join(attachmentsDir(), row.storagePath), { force: true }).catch(
    () => {}
  )
  if (row.cardId) {
    const cardId = row.cardId
    const [card] = await db
      .select({ key: schema.cards.key })
      .from(schema.cards)
      .where(eq(schema.cards.id, cardId))
      .limit(1)
    if (card) {
      await notify(db, {
        type: 'card.changed',
        projectId: row.projectId,
        cardId,
        cardKey: card.key
      })
    }
  } else if (row.intakeItemId) {
    await notify(db, {
      type: 'inbox.changed',
      projectId: row.projectId,
      intakeId: row.intakeItemId
    })
  }
  return row
}

export async function hasAttachments(db: Database, cardId: string): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.attachments)
    .where(eq(schema.attachments.cardId, cardId))
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
      cardId: schema.attachments.cardId,
      count: sql<number>`count(*)::int`
    })
    .from(schema.attachments)
    .where(inArray(schema.attachments.cardId, ids))
    .groupBy(schema.attachments.cardId)
  for (const r of rows) {
    if (r.cardId) map.set(r.cardId, r.count)
  }
  return map
}

export async function attachmentCountsByIntakeIds(
  db: Database,
  ids: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (ids.length === 0) return map
  const rows = await db
    .select({
      intakeItemId: schema.attachments.intakeItemId,
      count: sql<number>`count(*)::int`
    })
    .from(schema.attachments)
    .where(inArray(schema.attachments.intakeItemId, ids))
    .groupBy(schema.attachments.intakeItemId)
  for (const r of rows) {
    if (r.intakeItemId) map.set(r.intakeItemId, r.count)
  }
  return map
}

/**
 * Delete staged uploads older than the TTL (abandoned composers — tab closed,
 * draft discarded). Associated rows are never touched: association clears the
 * both-FKs-null state this filters on. Returns how many rows were removed.
 */
export async function sweepStagedAttachments(db: Database): Promise<number> {
  const rows = await db
    .delete(schema.attachments)
    .where(
      and(
        isNull(schema.attachments.cardId),
        isNull(schema.attachments.intakeItemId),
        // DB-side clock, like the enrichment sweep — immune to host skew.
        lt(
          schema.attachments.createdAt,
          sql`now() - make_interval(secs => ${STAGING_TTL_SECS})`
        )
      )
    )
    .returning({ storagePath: schema.attachments.storagePath })
  for (const row of rows) {
    await rm(path.join(attachmentsDir(), row.storagePath), {
      force: true
    }).catch(() => {})
  }
  return rows.length
}
