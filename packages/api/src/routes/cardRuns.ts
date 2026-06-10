import type { FastifyInstance } from 'fastify'

import {
  cancelCardRun,
  getLatestCardRunByKey,
  triggerCardRun
} from '@claude-organizer/core'
import type { Database } from '@claude-organizer/db'

// Thin HTTP surface over the auto-implement runner engine (CO-28). The engine
// owns eligibility/concurrency/claim/worktree and emits the card.changed SSE on
// every run transition, so these routes just delegate and let the shared error
// handler map InputError → 400 and ConflictError → 409.
export function registerCardRunRoutes(app: FastifyInstance, db: Database) {
  // Start an auto-implement run for a leaf card (by key).
  app.post<{ Params: { key: string } }>('/cards/:key/auto-run', async (req, reply) => {
    const run = await triggerCardRun(db, { cardKey: req.params.key })
    return reply.code(201).send(run)
  })

  // Current/most-recent run state for a card; `{ run: null }` if never auto-run.
  app.get<{ Params: { key: string } }>('/cards/:key/auto-run', async req => ({
    run: await getLatestCardRunByKey(db, req.params.key)
  }))

  // Cancel the card's currently-running run — a no-op when none is running.
  app.post<{ Params: { key: string } }>('/cards/:key/auto-run/cancel', async (req) => {
    const run = await getLatestCardRunByKey(db, req.params.key)
    if (run && run.status === 'running') return cancelCardRun(db, run.id)
    return { ok: true }
  })
}
