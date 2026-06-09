import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import Fastify from 'fastify'

import { createAuth, getTrustedOrigins } from '@claude-organizer/auth'
import { reconcileStuckEnrichment } from '@claude-organizer/core'
import { createDb } from '@claude-organizer/db'

import { registerAuthEnforcement } from './plugins/auth-enforcement'
import errorHandlerPlugin from './plugins/error-handler'
import eventsPlugin from './plugins/events'
import { registerAdminRoutes } from './routes/admin'
import { registerAuthRoutes } from './routes/auth'
import { registerBackupRoutes } from './routes/backup'
import { registerBlockerRoutes } from './routes/blockers'
import { registerCardClaimRoutes } from './routes/cardClaims'
import { registerCardCommitRoutes } from './routes/cardCommits'
import { registerCardRoutes } from './routes/cards'
import { registerCommentRoutes } from './routes/comments'
import { registerDocRoutes } from './routes/docs'
import { registerEventsWs } from './routes/events-ws'
import { registerIntakeRoutes } from './routes/intake'
import { registerProjectRoutes } from './routes/projects'
import { registerSprintRoutes } from './routes/sprints'
import { registerTagRoutes } from './routes/tags'

const port = Number(process.env.API_PORT ?? 4400)
const host = process.env.API_HOST ?? '127.0.0.1'
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const { db, close } = createDb({ url: databaseUrl })
const auth = createAuth(db)

const app = Fastify({ logger: true })

// Without a secret better-auth signs sessions with a predictable derived key —
// forgeable tokens. Refuse to boot in production; warn loudly otherwise.
if (!process.env.BETTER_AUTH_SECRET) {
  const msg = 'BETTER_AUTH_SECRET is not set — sessions would be signed with an insecure default.'
  if (process.env.NODE_ENV === 'production') {
    console.error(`${msg} Refusing to start in production.`)
    process.exit(1)
  }
  app.log.warn(msg)
}

const corsOrigins = getTrustedOrigins()
if (!process.env.AUTH_TRUSTED_ORIGINS) {
  app.log.warn(
    'AUTH_TRUSTED_ORIGINS not set — defaulting to the dev web origin (http://127.0.0.1:4401). Set it in production or browser login/API calls are blocked.'
  )
}

// @fastify/cors v11 narrowed the default `methods` to the CORS-safelist
// (GET,HEAD,POST), which drops PATCH/PUT/DELETE and breaks every update/delete
// from the browser (cross-origin preflight). Spell out the full set.
// `credentials: true` demands an explicit origin allow-list (never `*`/reflect-
// all), so only the trusted web origins can send the session cookie — reuses
// better-auth's trusted-origins list.
await app.register(cors, {
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']
})
await app.register(websocket)
await app.register(errorHandlerPlugin)
await app.register(eventsPlugin)

app.get('/health', async () => ({ status: 'ok' }))

app.decorate('db', db)
registerAuthRoutes(app, auth, db)
registerAuthEnforcement(app, auth, db)
registerAdminRoutes(app, db)
registerProjectRoutes(app, db)
registerSprintRoutes(app, db)
registerCardRoutes(app, db)
registerCardClaimRoutes(app, db)
registerCardCommitRoutes(app, db)
registerCommentRoutes(app, db)
registerTagRoutes(app, db)
registerBlockerRoutes(app, db)
registerDocRoutes(app, db)
registerIntakeRoutes(app, db)
registerBackupRoutes(app, db)
registerEventsWs(app)

const shutdown = async () => {
  await app.close()
  await close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// Recover inbox items stuck in `enriching` (orphaned by a dead process or a
// runaway run): sweep once on boot, then on an interval. unref() so it never
// keeps the process alive on shutdown.
const sweepEnrichment = () => {
  reconcileStuckEnrichment(db)
    .then((n) => { if (n > 0) app.log.warn(`reconciled ${n} stuck enrichment item(s)`) })
    .catch(err => app.log.error(err, 'enrichment reconcile failed'))
}

try {
  await app.listen({ port, host })
  app.log.info(`API ready on http://${host}:${port}`)
  sweepEnrichment()
  setInterval(sweepEnrichment, 60_000).unref()
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
