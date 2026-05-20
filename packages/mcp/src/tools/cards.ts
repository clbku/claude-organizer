import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import {
  archiveCard,
  createCard,
  destroyCard,
  getCard,
  getCardByKey,
  listCards,
  moveCardToBacklog,
  moveCardToSprint,
  restoreCard,
  updateCard
} from '@claude-organizer/core'
import type { Database } from '@claude-organizer/db'

import { asJson } from './index'

const cardStatus = z.enum([
  'todo',
  'in_progress',
  'review',
  'done',
  'blocked'
])

export function registerCardTools(server: McpServer, db: Database) {
  server.tool(
    'list_cards',
    'List cards of a project. Returns key/title/summary/status/etc but NOT descriptionMd (call get_card for full description). Filter by sprint, status, or backlog-only. Archived cards are hidden by default.',
    {
      projectId: z.string(),
      sprintId: z.string().nullable().optional(),
      status: cardStatus.optional(),
      backlogOnly: z.boolean().optional(),
      includeArchived: z
        .boolean()
        .optional()
        .describe('Include archived cards alongside active ones.'),
      archivedOnly: z
        .boolean()
        .optional()
        .describe('Return ONLY archived cards (e.g. archived column of a sprint or the backlog).')
    },
    async input => asJson(await listCards(db, input))
  )

  server.tool(
    'get_card',
    'Get a single card by its internal id (crd_xxx) with full descriptionMd.',
    { id: z.string() },
    async ({ id }) => asJson(await getCard(db, id))
  )

  server.tool(
    'get_card_by_key',
    'Get a single card by its human-readable key (e.g. \'CO-12\') with full descriptionMd.',
    { key: z.string() },
    async ({ key }) => asJson(await getCardByKey(db, key))
  )

  server.tool(
    'create_card',
    'Create a card in the backlog (default) or a specific sprint. ALWAYS provide a `summary`: one short sentence (max ~120 chars) in natural language describing WHAT this card is about. Summary shows in the board preview and in list_cards results, so users and AI can scan many cards at once. Use `descriptionMd` for full markdown details, acceptance criteria, links, etc.',
    {
      projectId: z.string(),
      sprintId: z.string().optional(),
      title: z.string().min(1).max(200),
      summary: z
        .string()
        .max(200)
        .optional()
        .describe('One-sentence natural language summary (~80-120 chars). Strongly encouraged.'),
      descriptionMd: z.string().optional().describe('Full markdown description. Optional.'),
      status: cardStatus.optional(),
      priority: z.number().int().min(0).max(10).optional(),
      dueDate: z.string().datetime().optional(),
      parentId: z
        .string()
        .optional()
        .describe('Parent story card id (crd_xxx) to make this a sub-task.')
    },
    async input =>
      asJson(
        await createCard(db, {
          ...input,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined
        })
      )
  )

  server.tool(
    'update_card',
    'Update fields of a card.',
    {
      id: z.string(),
      title: z.string().min(1).max(200).optional(),
      summary: z.string().max(200).nullable().optional(),
      descriptionMd: z.string().optional(),
      status: cardStatus.optional(),
      priority: z.number().int().min(0).max(10).optional(),
      dueDate: z.string().datetime().nullable().optional(),
      parentId: z
        .string()
        .nullable()
        .optional()
        .describe('Parent story card id (crd_xxx), or null to detach.')
    },
    async input =>
      asJson(
        await updateCard(db, {
          ...input,
          dueDate:
            input.dueDate === null
              ? null
              : input.dueDate
                ? new Date(input.dueDate)
                : undefined
        })
      )
  )

  server.tool(
    'set_card_status',
    'Shortcut to change a card status.',
    { id: z.string(), status: cardStatus },
    async ({ id, status }) => asJson(await updateCard(db, { id, status }))
  )

  server.tool(
    'move_card_to_backlog',
    'Remove a card from its current sprint (back to backlog).',
    { id: z.string() },
    async ({ id }) => asJson(await moveCardToBacklog(db, id))
  )

  server.tool(
    'move_card_to_sprint',
    'Move a card to a specific sprint.',
    { id: z.string(), sprintId: z.string() },
    async ({ id, sprintId }) => asJson(await moveCardToSprint(db, id, sprintId))
  )

  server.tool(
    'archive_card',
    'Archive a card (soft-delete): it disappears from normal listings but is kept and can be restored. Shows up in list_cards with archivedOnly=true.',
    { id: z.string() },
    async ({ id }) => asJson(await archiveCard(db, id))
  )

  server.tool(
    'restore_card',
    'Restore (unarchive) a previously archived card.',
    { id: z.string() },
    async ({ id }) => asJson(await restoreCard(db, id))
  )

  server.tool(
    'destroy_card',
    'Permanently delete a card (hard-delete, IRREVERSIBLE), along with its sub-tasks, comments, tags and blocker links. To merely hide a card, use archive_card instead.',
    { id: z.string() },
    async ({ id }) => asJson(await destroyCard(db, id))
  )
}
