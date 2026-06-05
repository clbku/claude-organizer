import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import {
  approveUser,
  listPendingUsers,
  rejectUser,
  setAuthEnabled
} from '@claude-organizer/core'
import type { Database } from '@claude-organizer/db'
import { USER_ROLES } from '@claude-organizer/shared'

// These routes are admin-only — enforced centrally in the auth-enforcement
// preHandler (ADMIN_ONLY), so the handlers don't re-check the role.
const approveBody = z.object({
  role: z.enum(USER_ROLES),
  allProjects: z.boolean(),
  projectIds: z.array(z.string()).optional()
})
const settingsBody = z.object({ authEnabled: z.boolean() })

export function registerAdminRoutes(app: FastifyInstance, db: Database) {
  app.get('/admin/users/pending', async () => listPendingUsers(db))

  app.post<{ Params: { id: string } }>(
    '/admin/users/:id/approve',
    async (req) => {
      const body = approveBody.parse(req.body)
      return approveUser(db, req.params.id, body)
    }
  )

  app.post<{ Params: { id: string } }>(
    '/admin/users/:id/reject',
    async (req, reply) => {
      const removed = await rejectUser(db, req.params.id)
      if (!removed) return reply.code(404).send({ error: 'not_found' })
      return { deleted: true }
    }
  )

  app.post('/admin/settings', async (req) => {
    const { authEnabled } = settingsBody.parse(req.body)
    return setAuthEnabled(db, authEnabled)
  })
}
