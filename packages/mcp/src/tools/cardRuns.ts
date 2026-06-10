import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { triggerCardRun } from '@claude-organizer/core'
import type { Database } from '@claude-organizer/db'

import { asJson } from './index'

export function registerCardRunTools(server: McpServer, db: Database) {
  server.registerTool(
    'auto_run_card',
    {
      description:
        'Trigger an auto-implement run for a LEAF task by key: the runner reserves the card, opens an isolated git worktree, runs the AI through the implement lifecycle, and stops the card at `review` — it NEVER commits, a human reviews the diff and decides. Manual, one card at a time. Returns `{ ok:true, run }` (with the run id, branch and worktree path) when accepted, or `{ ok:false, error }` with the reason when rejected (not a leaf task / not `todo` / blocked / no acceptance criteria / concurrency limit reached / already reserved / no repo checkout).',
      inputSchema: {
        cardKey: z.string().describe('Card key of a leaf task, e.g. \'CO-31\'.')
      }
    },
    async ({ cardKey }) => {
      // The engine owns eligibility/concurrency/claim/worktree — this tool is a
      // thin shell. Its rejections throw (InputError/ConflictError); surface the
      // reason as data so the caller sees why instead of an opaque tool error.
      try {
        const run = await triggerCardRun(db, { cardKey })
        return asJson({ ok: true, run })
      } catch (err) {
        return asJson({ ok: false, error: (err as Error).message })
      }
    }
  )
}
