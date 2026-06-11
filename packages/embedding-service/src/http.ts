import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http'

import type { Embedder, EmbeddingKind } from './embedder'

interface HttpServerOptions {
  embedder: Embedder
  port: number
  host?: string
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
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

function isEmbedKind(value: unknown): value is EmbeddingKind {
  return value === 'query' || value === 'passage'
}

export async function handleEmbeddingRequest(
  embedder: Embedder,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  if (url.pathname === '/health') {
    if (req.method !== 'GET') return void res.writeHead(405).end()
    const status = embedder.status()
    // Not-ready (still loading / load failed) ⇒ 503 so the container healthcheck
    // waits for the model; `disabled` is a healthy steady state (no model on purpose).
    const ready = status.state === 'ready' || status.state === 'disabled'
    return sendJson(res, ready ? 200 : 503, status)
  }

  if (url.pathname === '/embed') {
    if (req.method !== 'POST') return void res.writeHead(405).end()
    let body: unknown
    try {
      body = await readJsonBody(req)
    } catch {
      return sendJson(res, 400, { error: 'invalid_json' })
    }
    const { texts, kind } = (body ?? {}) as { texts?: unknown, kind?: unknown }
    if (!Array.isArray(texts) || !texts.every(t => typeof t === 'string') || !isEmbedKind(kind)) {
      return sendJson(res, 400, { error: 'invalid_body' })
    }
    const vectors = await embedder.embed(texts, kind)
    return sendJson(res, 200, { vectors })
  }

  if (url.pathname === '/reload') {
    if (req.method !== 'POST') return void res.writeHead(405).end()
    await embedder.reload()
    return sendJson(res, 200, embedder.status())
  }

  res.writeHead(404).end()
}

export function createEmbeddingHttpServer({
  embedder,
  port,
  host = '0.0.0.0'
}: HttpServerOptions): Server {
  const server = createServer((req, res) => {
    handleEmbeddingRequest(embedder, req, res).catch((err) => {
      console.error('[embedding-service] request error', err)
      if (!res.headersSent) sendJson(res, 500, { error: 'internal' })
    })
  })
  server.listen(port, host, () => {
    console.log(`[embedding-service] listening on http://${host}:${port}`)
  })
  return server
}
