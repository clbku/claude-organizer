import type { FastifyInstance } from 'fastify'

import {
  archiveProject,
  createProject,
  destroyProject,
  getProjectBySlug,
  listProjects,
  restoreProject
} from '@claude-organizer/core'
import type { Database } from '@claude-organizer/db'

export function registerProjectRoutes(app: FastifyInstance, db: Database) {
  app.get<{ Querystring: { includeArchived?: string, archivedOnly?: string } }>(
    '/projects',
    async req =>
      listProjects(db, {
        includeArchived: req.query.includeArchived === 'true',
        archivedOnly: req.query.archivedOnly === 'true'
      })
  )

  app.get<{ Params: { slug: string } }>(
    '/projects/:slug',
    async (req, reply) => {
      const project = await getProjectBySlug(db, req.params.slug)
      if (!project) return reply.code(404).send({ error: 'not_found' })
      return project
    }
  )

  app.post('/projects', async req => createProject(db, req.body as never))

  app.post<{ Params: { id: string } }>(
    '/projects/:id/archive',
    async (req, reply) => {
      const project = await archiveProject(db, req.params.id)
      if (!project) return reply.code(404).send({ error: 'not_found' })
      return project
    }
  )

  app.post<{ Params: { id: string } }>(
    '/projects/:id/restore',
    async (req, reply) => {
      const project = await restoreProject(db, req.params.id)
      if (!project) return reply.code(404).send({ error: 'not_found' })
      return project
    }
  )

  app.delete<{ Params: { id: string }, Body: { confirmSlug?: string } }>(
    '/projects/:id',
    async (req, reply) => {
      const result = await destroyProject(
        db,
        req.params.id,
        req.body?.confirmSlug ?? ''
      )
      if (!result) return reply.code(404).send({ error: 'not_found' })
      return result
    }
  )
}
