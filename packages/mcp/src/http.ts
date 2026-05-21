import { randomUUID, timingSafeEqual } from 'node:crypto'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http'

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'

import type { Database } from '@claude-organizer/db'

import { createMcpServer } from './create-server'

interface HttpServerOptions {
  db: Database
  port: number
  // When set, every request must carry `Authorization: Bearer <authToken>`.
  authToken?: string
}

const MCP_PATH = '/mcp'

function jsonRpcError(code: number, message: string) {
  return JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null })
}

function sendError(res: ServerResponse, status: number, code: number, message: string) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(jsonRpcError(code, message))
}

// Constant-time bearer check; returns false on any shape/length mismatch.
function isAuthorized(req: IncomingMessage, authToken: string) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) return false
  const provided = Buffer.from(header.slice('Bearer '.length))
  const expected = Buffer.from(authToken)
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', chunk => (raw += chunk))
    req.on('end', () => {
      if (!raw) {
        resolve(undefined)
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
    req.on('error', reject)
  })
}

// Streamable HTTP transport (stateful): one session per `Mcp-Session-Id`,
// created on the initialize request and torn down on close. Mirrors the stdio
// behaviour — same tools, same handshake.
export function startHttpServer({ db, port, authToken }: HttpServerOptions): Server {
  const transports = new Map<string, StreamableHTTPServerTransport>()

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    if (url.pathname !== MCP_PATH) {
      res.writeHead(404).end()
      return
    }

    if (authToken && !isAuthorized(req, authToken)) {
      sendError(res, 401, -32001, 'Unauthorized')
      return
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined

    if (req.method === 'POST') {
      let body: unknown
      try {
        body = await readJsonBody(req)
      } catch {
        sendError(res, 400, -32700, 'Parse error')
        return
      }

      let transport = sessionId ? transports.get(sessionId) : undefined
      if (!transport) {
        // Stale/unknown session (e.g. this process restarted and lost the map):
        // answer 404 so the client knows the session is gone and reinitializes a
        // new one, per the MCP spec. A 400 here is an unrecoverable error that
        // leaves the client's open session broken until it's fully restarted.
        if (sessionId) {
          sendError(res, 404, -32001, 'Session not found')
          return
        }
        if (!isInitializeRequest(body)) {
          sendError(res, 400, -32000, 'Bad Request: no valid session ID')
          return
        }
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            transports.set(id, transport!)
          }
        })
        transport.onclose = () => {
          if (transport!.sessionId) transports.delete(transport!.sessionId)
        }
        await createMcpServer(db).connect(transport)
      }

      await transport.handleRequest(req, res, body)
      return
    }

    // GET (SSE stream) and DELETE (session termination) need an open session.
    if (req.method === 'GET' || req.method === 'DELETE') {
      const transport = sessionId ? transports.get(sessionId) : undefined
      if (!transport) {
        // Same contract as POST: a known-but-gone session is 404 (reinitialize),
        // a missing header is 400.
        if (sessionId) sendError(res, 404, -32001, 'Session not found')
        else sendError(res, 400, -32000, 'Bad Request: no valid session ID')
        return
      }
      await transport.handleRequest(req, res)
      return
    }

    res.writeHead(405).end()
  }

  const httpServer = createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error('[claude-organizer-mcp] request error', err)
      if (!res.headersSent) sendError(res, 500, -32603, 'Internal server error')
    })
  })

  httpServer.listen(port, () => {
    const auth = authToken ? ' (bearer auth required)' : ''
    console.error(
      `[claude-organizer-mcp] Streamable HTTP transport on http://127.0.0.1:${port}${MCP_PATH}${auth}`
    )
  })

  return httpServer
}
