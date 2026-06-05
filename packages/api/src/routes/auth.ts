import { fromNodeHeaders } from 'better-auth/node'
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from 'fastify'

import type { Auth } from '@claude-organizer/auth'
import { hasAnyUser, isGithubConfigured } from '@claude-organizer/auth'
import type { Database } from '@claude-organizer/db'
import type { AuthCapabilities, SessionUser } from '@claude-organizer/shared'

// Bridge Fastify ↔ web Request/Response (instead of toNodeHandler + hijack) so
// the @fastify/cors hook still applies to better-auth's responses — a hijacked
// reply bypasses it, which would break cross-origin login from the web.
// Assumes JSON request bodies, which is better-auth's whole surface here (its
// other entry points are GET); a future non-JSON endpoint would need handling.
function toWebRequest(request: FastifyRequest): Request {
  const url = new URL(
    request.url,
    `${request.protocol}://${request.headers.host}`
  )
  const headers = fromNodeHeaders(request.headers)
  headers.delete('content-length') // body is re-serialized below
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  return new Request(url, {
    method: request.method,
    headers,
    body: hasBody ? JSON.stringify(request.body ?? {}) : undefined
  })
}

function sendWebResponse(reply: FastifyReply, res: Response, body: string) {
  reply.status(res.status)
  res.headers.forEach((value, key) => {
    // Set-Cookie is handled below; forEach would comma-join multiple cookies.
    if (key.toLowerCase() !== 'set-cookie') reply.header(key, value)
  })
  for (const cookie of res.headers.getSetCookie()) {
    reply.header('set-cookie', cookie)
  }
  reply.send(body.length > 0 ? body : null)
}

export function registerAuthRoutes(
  app: FastifyInstance,
  auth: Auth,
  db: Database
) {
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    handler: async (request, reply) => {
      const res = await auth.handler(toWebRequest(request))
      sendWebResponse(reply, res, await res.text())
    }
  })

  app.get('/auth/capabilities', async (): Promise<AuthCapabilities> => ({
    emailPassword: true,
    github: isGithubConfigured(),
    hasUsers: await hasAnyUser(db)
  }))

  app.get('/auth/me', async (request): Promise<SessionUser | null> => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers)
    })
    if (!session) return null
    const { user } = session
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image ?? null
    }
  })
}
