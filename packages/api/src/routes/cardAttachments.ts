import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'

import type { FastifyInstance } from 'fastify'

import {
  attachmentsDir,
  createAttachment,
  deleteAttachment,
  getAttachment,
  InputError,
  listCardAttachments
} from '@claude-organizer/core'
import type { Database } from '@claude-organizer/db'

export function registerCardAttachmentRoutes(
  app: FastifyInstance,
  db: Database
) {
  // Multipart upload of a single file. The raw size is capped generously by the
  // multipart plugin (registered in server.ts); the core enforces the real
  // 20MB-after-compression rule and rejects oversized non-images.
  app.post<{ Params: { cardId: string } }>(
    '/cards/:cardId/attachments',
    async (req, reply) => {
      const data = await req.file()
      if (!data) {
        throw new InputError('No file was uploaded')
      }
      const bytes = await data.toBuffer()
      const row = await createAttachment(db, {
        cardId: req.params.cardId,
        filename: data.filename,
        mimeType: data.mimetype,
        bytes
      })
      return reply.code(201).send(row)
    }
  )

  app.get<{ Params: { cardId: string } }>(
    '/cards/:cardId/attachments',
    async req => listCardAttachments(db, req.params.cardId)
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
