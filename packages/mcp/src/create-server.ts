import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { Database } from '@claude-organizer/db'

import packageJson from '../package.json'
import { registerResources } from './resources/index'
import { registerTools } from './tools/index'

// Builds a fully-registered MCP server (same tools/resources regardless of
// transport). The HTTP transport creates one per session; stdio uses a single
// instance. `db` is shared across all of them.
export function createMcpServer(db: Database) {
  const server = new McpServer({
    name: 'claude-organizer',
    version: packageJson.version
  })

  registerTools(server, db)
  registerResources(server, db)

  return server
}
