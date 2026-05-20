import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import {
  archiveSprint,
  completeSprint,
  createSprint,
  destroySprint,
  getActiveSprint,
  listSprints,
  restoreSprint,
  startSprint,
  updateSprint
} from '@claude-organizer/core'
import type { Database } from '@claude-organizer/db'

import { asJson } from './index'

export function registerSprintTools(server: McpServer, db: Database) {
  server.tool(
    'list_sprints',
    'List sprints of a project. Archived sprints are hidden by default.',
    {
      projectId: z.string(),
      includeArchived: z
        .boolean()
        .optional()
        .describe('Include archived sprints alongside active ones.'),
      archivedOnly: z
        .boolean()
        .optional()
        .describe('Return ONLY archived sprints.')
    },
    async ({ projectId, includeArchived, archivedOnly }) =>
      asJson(await listSprints(db, projectId, { includeArchived, archivedOnly }))
  )

  server.tool(
    'get_active_sprint',
    'Get the currently active sprint of a project, if any.',
    { projectId: z.string() },
    async ({ projectId }) => asJson(await getActiveSprint(db, projectId))
  )

  server.tool(
    'create_sprint',
    'Create a planned sprint (status=planned).',
    {
      projectId: z.string(),
      roadmapId: z.string().optional(),
      name: z.string().min(1).max(120),
      goal: z.string().max(500).optional(),
      startsAt: z.string().datetime().optional(),
      endsAt: z.string().datetime().optional()
    },
    async input =>
      asJson(
        await createSprint(db, {
          ...input,
          startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
          endsAt: input.endsAt ? new Date(input.endsAt) : undefined
        })
      )
  )

  server.tool(
    'update_sprint',
    'Rename a sprint or change its goal/objective. Pass the sprint id (spr_xxx) plus the fields to change. `goal` accepts null to clear it. Works for sprints in any status.',
    {
      id: z.string(),
      name: z.string().min(1).max(120).optional(),
      goal: z.string().max(500).nullable().optional()
    },
    async input => asJson(await updateSprint(db, input))
  )

  server.tool(
    'start_sprint',
    'Activate a sprint. Any currently active sprint in the same project is auto-completed.',
    { sprintId: z.string() },
    async ({ sprintId }) => asJson(await startSprint(db, sprintId))
  )

  server.tool(
    'complete_sprint',
    'Mark a sprint as completed.',
    { sprintId: z.string() },
    async ({ sprintId }) => asJson(await completeSprint(db, sprintId))
  )

  server.tool(
    'archive_sprint',
    'Archive a sprint (soft-delete): it disappears from normal listings but is kept and can be restored. Its cards travel with it (they are not individually marked). Shows up in list_sprints with archivedOnly=true.',
    { id: z.string() },
    async ({ id }) => asJson(await archiveSprint(db, id))
  )

  server.tool(
    'restore_sprint',
    'Restore (unarchive) a previously archived sprint.',
    { id: z.string() },
    async ({ id }) => asJson(await restoreSprint(db, id))
  )

  server.tool(
    'destroy_sprint',
    'Permanently delete a sprint and ALL its cards (hard-delete, IRREVERSIBLE), including those cards\' comments, tags and blocker links. To merely hide a sprint, use archive_sprint instead.',
    { id: z.string() },
    async ({ id }) => asJson(await destroySprint(db, id))
  )
}
