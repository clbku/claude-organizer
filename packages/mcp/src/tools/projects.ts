import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import {
  createProject,
  getProjectBySlug,
  listProjects,
  updateProjectKeyPrefix
} from '@claude-organizer/core'
import type { Database } from '@claude-organizer/db'

import { asJson } from './index'

export function registerProjectTools(server: McpServer, db: Database) {
  server.registerTool(
    'list_projects',
    {
      description: 'List all projects tracked by claude-organizer.',
      inputSchema: {}
    },
    async () => asJson(await listProjects(db))
  )

  server.registerTool(
    'get_project',
    {
      description: 'Get a project by its slug.',
      inputSchema: { slug: z.string().describe('Project slug (e.g. \'my-app\')') }
    },
    async ({ slug }) => asJson(await getProjectBySlug(db, slug))
  )

  server.registerTool(
    'create_project',
    {
      description:
        'Create a new project workspace. keyPrefix becomes the prefix for card keys (e.g. \'CO\' produces CO-1, CO-2). If omitted, derived from the slug.',
      inputSchema: {
        name: z.string().min(1).max(120),
        slug: z
          .string()
          .min(1)
          .max(60)
          .regex(/^[a-z0-9][a-z0-9-]*$/),
        description: z.string().max(2000).optional(),
        keyPrefix: z
          .string()
          .min(1)
          .max(10)
          .regex(/^[A-Z][A-Z0-9]{0,9}$/)
          .optional()
          .describe('Uppercase letters/digits, starting with a letter. Max 10 chars.')
      }
    },
    async input => asJson(await createProject(db, input))
  )

  server.registerTool(
    'update_project_key_prefix',
    {
      description:
        'Change the keyPrefix of a project. Existing card keys are NOT renamed - only new cards use the new prefix.',
      inputSchema: {
        projectId: z.string(),
        newPrefix: z
          .string()
          .min(1)
          .max(10)
          .regex(/^[A-Z][A-Z0-9]{0,9}$/)
      }
    },
    async ({ projectId, newPrefix }) =>
      asJson(await updateProjectKeyPrefix(db, projectId, newPrefix))
  )
}
