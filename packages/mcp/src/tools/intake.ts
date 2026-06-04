import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import {
  archiveIntakeItem,
  destroyIntakeItem,
  intakeStatus,
  listIntakeItems,
  markIntakePlanned
} from '@claude-organizer/core'
import type { Database } from '@claude-organizer/db'

import { asJson } from './index'

export function registerIntakeTools(server: McpServer, db: Database) {
  server.registerTool(
    'list_inbox',
    {
      description:
        'List the raw intake demands of a project (the Inbox). Defaults to pending demands; pass status to filter. Each item has id, bodyMd, status, plannedCardKeys and timestamps.',
      inputSchema: {
        projectId: z.string(),
        status: intakeStatus.optional()
      }
    },
    async ({ projectId, status }) =>
      asJson(
        await listIntakeItems(db, projectId, { status: status ?? 'pending' })
      )
  )

  server.registerTool(
    'mark_inbox_planned',
    {
      description:
        'Mark an inbox demand as planned, recording the keys of the cards it became (e.g. CO-12, CO-13). Call after a demand has been planned into cards.',
      inputSchema: {
        id: z.string(),
        cardKeys: z.array(z.string()).min(1)
      }
    },
    async ({ id, cardKeys }) => asJson(await markIntakePlanned(db, id, cardKeys))
  )

  server.registerTool(
    'archive_inbox',
    {
      description:
        'Archive an inbox demand (status archived) — recoverable. Use when a demand is discarded during planning but the user may want it back. Restore is done from the web.',
      inputSchema: {
        id: z.string()
      }
    },
    async ({ id }) => asJson(await archiveIntakeItem(db, id))
  )

  server.registerTool(
    'destroy_inbox',
    {
      description:
        'Permanently delete an inbox demand. Use when a discarded demand should be gone for good; prefer archive_inbox when recovery might be wanted.',
      inputSchema: {
        id: z.string()
      }
    },
    async ({ id }) => asJson(await destroyIntakeItem(db, id))
  )
}
