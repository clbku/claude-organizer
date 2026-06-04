import type { FastifyInstance, FastifyReply } from 'fastify'

import { exportAll, exportProject, serializeBackup } from '@claude-organizer/core'
import type { Database } from '@claude-organizer/db'

function sendBackup(reply: FastifyReply, filename: string, payload: Buffer) {
  reply.header('Content-Type', 'application/gzip')
  reply.header('Content-Disposition', `attachment; filename="${filename}"`)
  return reply.send(payload)
}

export function registerBackupRoutes(app: FastifyInstance, db: Database) {
  app.get<{ Params: { projectId: string } }>(
    '/projects/:projectId/export',
    async (req, reply) => {
      const env = await exportProject(db, req.params.projectId)
      if (!env.projectIds.length) {
        return reply.code(404).send({ error: 'not_found' })
      }
      return sendBackup(
        reply,
        `backup-${req.params.projectId}-v${env.version}.json.gz`,
        serializeBackup(env)
      )
    }
  )

  app.get('/export', async (_req, reply) => {
    const env = await exportAll(db)
    return sendBackup(reply, `backup-all-v${env.version}.json.gz`, serializeBackup(env))
  })
}
