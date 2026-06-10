import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'

import type { FastifyInstance, FastifyRequest } from 'fastify'

import {
  attachmentsDir,
  createAttachment,
  deleteAttachment,
  getAttachment,
  getCardIdByKey,
  InputError,
  listCardAttachments,
  listIntakeAttachments
} from '@claude-organizer/core'
import type { Database } from '@claude-organizer/db'
import {
  INBOX_IMAGE_TYPES,
  MAX_INBOX_IMAGE_BYTES
} from '@claude-organizer/shared'

const inboxImageTypes = new Set<string>(INBOX_IMAGE_TYPES)

// `maxBytes` caps the part at the multipart layer (abort early as 413) instead
// of buffering up to the generous global limit just to reject afterwards.
async function readUpload(req: FastifyRequest, maxBytes?: number) {
  const data = await req.file(
    maxBytes ? { limits: { fileSize: maxBytes } } : undefined
  )
  if (!data) {
    throw new InputError('No file was uploaded')
  }
  return {
    filename: data.filename,
    mimeType: data.mimetype,
    bytes: await data.toBuffer()
  }
}

function assertInboxImage(upload: { mimeType: string, bytes: Buffer }) {
  if (!inboxImageTypes.has(upload.mimeType)) {
    throw new InputError(
      'Only JPEG, PNG, GIF or WebP images can be attached to inbox items'
    )
  }
  if (upload.bytes.byteLength > MAX_INBOX_IMAGE_BYTES) {
    throw new InputError(
      `Image exceeds the ${MAX_INBOX_IMAGE_BYTES / (1024 * 1024)}MB inbox limit`
    )
  }
}

export function registerAttachmentRoutes(app: FastifyInstance, db: Database) {
  // Multipart upload of a single file. The raw size is capped generously by the
  // multipart plugin (registered in server.ts); the core enforces the real
  // 20MB-after-compression rule and rejects oversized non-images.
  app.post<{ Params: { cardId: string } }>(
    '/cards/:cardId/attachments',
    async (req, reply) => {
      const upload = await readUpload(req)
      const row = await createAttachment(db, {
        cardId: req.params.cardId,
        ...upload
      })
      return reply.code(201).send(row)
    }
  )

  app.get<{ Params: { cardId: string } }>(
    '/cards/:cardId/attachments',
    async req => listCardAttachments(db, req.params.cardId)
  )

  // POST by key: the host-side upload script knows only the card key (never the
  // internal id), and a card-scoped commit token authorizes it without a session
  // — mirroring POST /cards/:key/commits. A distinct `by-key` path is required:
  // `/cards/:key/attachments` would collide with the id-keyed route above (same
  // method + same path shape, only the param name differs).
  app.post<{ Params: { key: string } }>(
    '/cards/by-key/:key/attachments',
    async (req, reply) => {
      const cardId = await getCardIdByKey(db, req.params.key)
      if (!cardId) {
        throw new InputError(`Card ${req.params.key} not found`)
      }
      const upload = await readUpload(req)
      const row = await createAttachment(db, {
        cardId,
        ...upload
      })
      return reply.code(201).send(row)
    }
  )

  // Staged upload while composing an intake item that doesn't exist yet; the
  // create-intake call associates the returned ids, the sweep reaps leftovers.
  app.post<{ Params: { projectId: string } }>(
    '/projects/:projectId/uploads/attachments',
    async (req, reply) => {
      const upload = await readUpload(req, MAX_INBOX_IMAGE_BYTES)
      assertInboxImage(upload)
      const row = await createAttachment(db, {
        stagingProjectId: req.params.projectId,
        ...upload
      })
      return reply.code(201).send(row)
    }
  )

  app.post<{ Params: { id: string } }>(
    '/intake/:id/attachments',
    async (req, reply) => {
      const upload = await readUpload(req, MAX_INBOX_IMAGE_BYTES)
      assertInboxImage(upload)
      const row = await createAttachment(db, {
        intakeItemId: req.params.id,
        ...upload
      })
      return reply.code(201).send(row)
    }
  )

  app.get<{ Params: { id: string } }>(
    '/intake/:id/attachments',
    async req => listIntakeAttachments(db, req.params.id)
  )

  // Stream the bytes back from disk. `inline` lets the browser render images in
  // the lightbox; non-renderable types fall through to a download.
  app.get<{ Params: { id: string } }>(
    '/attachments/:id/file',
    async (req, reply) => {
      const row = await getAttachment(db, req.params.id)
      if (!row) {
        return reply
          .code(404)
          .send({ error: 'Attachment not found', code: 'not_found' })
      }
      const abs = path.join(attachmentsDir(), row.storagePath)
      // The row can outlive its bytes (volume reset). Confirm the file before
      // streaming so a missing file is a clean 404, not a truncated response.
      try {
        await stat(abs)
      } catch {
        return reply
          .code(404)
          .send({ error: 'Attachment file missing', code: 'not_found' })
      }
      // Render images/videos inline (the lightbox loads the URL directly);
      // everything else downloads.
      const inline
        = row.mimeType.startsWith('image/') || row.mimeType.startsWith('video/')
      reply.header('Content-Type', row.mimeType)
      reply.header(
        'Content-Disposition',
        `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.filename)}`
      )
      return reply.send(createReadStream(abs))
    }
  )

  app.delete<{ Params: { id: string } }>(
    '/attachments/:id',
    async (req) => {
      const row = await deleteAttachment(db, req.params.id)
      return { deleted: row !== null }
    }
  )
}
