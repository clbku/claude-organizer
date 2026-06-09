import { Buffer } from 'node:buffer'

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import {
  createAttachment,
  getCardByKey,
  InputError,
  listCardAttachments
} from '@claude-organizer/core'
import type { Database } from '@claude-organizer/db'

import { asJson } from './index'

// A card is addressed by its internal id or its human key; exactly one is needed.
async function resolveCardId(
  db: Database,
  cardId: string | undefined,
  cardKey: string | undefined
): Promise<string> {
  if (cardId) return cardId
  if (cardKey) {
    const card = await getCardByKey(db, cardKey)
    if (!card) throw new InputError(`Card ${cardKey} not found`)
    return card.id
  }
  throw new InputError('Provide either cardId or cardKey')
}

export function registerCardAttachmentTools(server: McpServer, db: Database) {
  server.registerTool(
    'upload_card_attachment',
    {
      description:
        'Attach a proof-of-work file to a card via base64 (MCP has no multipart upload). Provide the bytes as `content` (base64), plus `filename` and `mimeType`, and identify the card by `cardId` (crd_xxx) or `cardKey` (e.g. CO-12). Images are compressed server-side; the stored file must be ≤20MB after compression or the call is rejected. A card needs at least one attachment before it can move to done.',
      inputSchema: {
        cardId: z
          .string()
          .optional()
          .describe('Internal card id (crd_xxx). Provide this or cardKey.'),
        cardKey: z
          .string()
          .optional()
          .describe('Human card key (e.g. CO-12). Provide this or cardId.'),
        filename: z.string().min(1),
        mimeType: z.string().min(1),
        content: z
          .string()
          .min(1)
          .describe('File bytes as a base64 string, decoded server-side.')
      }
    },
    async ({ cardId, cardKey, filename, mimeType, content }) => {
      const id = await resolveCardId(db, cardId, cardKey)
      const row = await createAttachment(db, {
        cardId: id,
        filename,
        mimeType,
        bytes: Buffer.from(content, 'base64'),
        uploaderLabel: 'mcp'
      })
      return asJson(row)
    }
  )

  server.registerTool(
    'list_card_attachments',
    {
      description:
        'List the attachments (proof-of-work files) on a card, addressed by `cardId` (crd_xxx) or `cardKey` (e.g. CO-12). Returns metadata only (id, filename, mimeType, size, createdAt); fetch the bytes over HTTP at /attachments/:id/file.',
      inputSchema: {
        cardId: z
          .string()
          .optional()
          .describe('Internal card id (crd_xxx). Provide this or cardKey.'),
        cardKey: z
          .string()
          .optional()
          .describe('Human card key (e.g. CO-12). Provide this or cardId.')
      }
    },
    async ({ cardId, cardKey }) => {
      const id = await resolveCardId(db, cardId, cardKey)
      return asJson(await listCardAttachments(db, id))
    }
  )
}
