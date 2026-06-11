import type { AddressInfo } from 'node:net'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Embedder, EmbedderStatus } from '../src/embedder'
import { createEmbeddingHttpServer } from '../src/http'

const readyStatus: EmbedderStatus = { state: 'ready', model: 'm', dim: 3 }

function fakeEmbedder(overrides: Partial<Embedder> = {}): Embedder {
  return {
    init: vi.fn(async () => {}),
    reload: vi.fn(async () => {}),
    status: () => readyStatus,
    embed: vi.fn(async (texts: string[]) => texts.map(t => [t.length])),
    ...overrides
  }
}

describe('embedding http server', () => {
  let server: ReturnType<typeof createEmbeddingHttpServer>
  let base: string
  let embedder: Embedder

  async function start(e: Embedder) {
    embedder = e
    server = createEmbeddingHttpServer({ embedder, port: 0, host: '127.0.0.1' })
    if (!server.listening) {
      await new Promise<void>(resolve => server.once('listening', () => resolve()))
    }
    const { port } = server.address() as AddressInfo
    base = `http://127.0.0.1:${port}`
  }

  beforeEach(() => start(fakeEmbedder()))
  afterEach(() => server.close())

  it('POST /embed returns the embedder vectors', async () => {
    const res = await fetch(`${base}/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texts: ['ab', 'cde'], kind: 'passage' })
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ vectors: [[2], [3]] })
    expect(embedder.embed).toHaveBeenCalledWith(['ab', 'cde'], 'passage')
  })

  it('POST /embed rejects a malformed body with 400', async () => {
    const bad = await fetch(`${base}/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texts: 'not-an-array', kind: 'query' })
    })
    expect(bad.status).toBe(400)

    const badKind = await fetch(`${base}/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texts: ['x'], kind: 'nope' })
    })
    expect(badKind.status).toBe(400)
  })

  it('POST /embed rejects invalid JSON with 400', async () => {
    const res = await fetch(`${base}/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ broken'
    })
    expect(res.status).toBe(400)
  })

  it('GET /health is 200 when ready and 503 while loading', async () => {
    const ok = await fetch(`${base}/health`)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({ state: 'ready' })

    server.close()
    await start(fakeEmbedder({ status: () => ({ state: 'loading', model: 'm', dim: 3 }) }))
    const loading = await fetch(`${base}/health`)
    expect(loading.status).toBe(503)
  })

  it('GET /health is 200 when disabled (no model on purpose)', async () => {
    server.close()
    await start(fakeEmbedder({ status: () => ({ state: 'disabled', model: null, dim: 384 }) }))
    const res = await fetch(`${base}/health`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ state: 'disabled' })
  })

  it('POST /reload triggers a reload and returns the new status', async () => {
    const reload = vi.fn(async () => {})
    server.close()
    await start(fakeEmbedder({ reload, status: () => ({ state: 'ready', model: 'm2', dim: 3 }) }))
    const res = await fetch(`${base}/reload`, { method: 'POST' })
    expect(res.status).toBe(200)
    expect(reload).toHaveBeenCalledOnce()
    expect(await res.json()).toMatchObject({ model: 'm2' })
  })

  it('404s an unknown path and 405s a wrong method', async () => {
    expect((await fetch(`${base}/nope`)).status).toBe(404)
    expect((await fetch(`${base}/embed`)).status).toBe(405)
    expect((await fetch(`${base}/health`, { method: 'POST' })).status).toBe(405)
  })
})
