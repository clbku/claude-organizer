import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { Database } from '@claude-organizer/db'

import { registerBlockerTools } from './blockers'
import { registerCardTools } from './cards'
import { registerCommentTools } from './comments'
import { registerDocTools } from './docs'
import { registerIntakeTools } from './intake'
import { registerProjectTools } from './projects'
import { registerSprintTools } from './sprints'
import { registerTagTools } from './tags'

export function registerTools(server: McpServer, db: Database) {
  registerProjectTools(server, db)
  registerSprintTools(server, db)
  registerCardTools(server, db)
  registerCommentTools(server, db)
  registerTagTools(server, db)
  registerBlockerTools(server, db)
  registerDocTools(server, db)
  registerIntakeTools(server, db)
}

export function asJson(value: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  }
}
