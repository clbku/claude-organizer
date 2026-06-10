import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import {
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

// Upload is intentionally NOT an MCP tool: a base64 `content` argument forces
// the model to emit the whole file token-by-token (slow + costly, and prone to
// truncation). Files are attached host-side via the `attach-file` script, which
// POSTs multipart straight to the API — bytes never enter an AI context.
export function registerCardAttachmentTools(server: McpServer, db: Database) {
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
