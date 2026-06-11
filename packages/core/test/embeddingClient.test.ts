import { afterEach, describe, expect, it, vi } from 'vitest'

import { embed, embedMany } from '../src/embedding'

const SERVICE = 'http://embedding.test'

function mockFetch(impl: typeof fetch) {
  const fn = vi.fn(impl)
  vi.stubGlobal('fetch', fn)
  return fn
}

function jsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), { status: ok ? 200 : 503 })
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('embedding client', () => {
  it('returns null without calling the service when EMBEDDING_MODEL=none', async () => {
    vi.stubEnv('EMBEDDING_MODEL', 'none')
    vi.stubEnv('EMBEDDING_SERVICE_URL', SERVICE)
    const fetchFn = mockFetch(async () => jsonResponse({ vectors: [[1]] }))
    expect(await embed('x', 'query')).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('returns null without calling the service when no service URL is set', async () => {
    vi.stubEnv('EMBEDDING_MODEL', 'Xenova/multilingual-e5-small')
    vi.stubEnv('EMBEDDING_SERVICE_URL', '')
    const fetchFn = mockFetch(async () => jsonResponse({ vectors: [[1]] }))
    expect(await embedMany(['x'], 'passage')).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('posts to the service and returns its vectors', async () => {
    vi.stubEnv('EMBEDDING_MODEL', 'Xenova/multilingual-e5-small')
    vi.stubEnv('EMBEDDING_SERVICE_URL', SERVICE)
    const fetchFn = mockFetch(async () => jsonResponse({ vectors: [[0.1, 0.2]] }))
    expect(await embed('hello', 'query')).toEqual([0.1, 0.2])
    const [url, init] = fetchFn.mock.calls[0]!
    expect(url).toBe(`${SERVICE}/embed`)
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      texts: ['hello'],
      kind: 'query'
    })
  })

  it('falls back to null on a non-ok response', async () => {
    vi.stubEnv('EMBEDDING_MODEL', 'Xenova/multilingual-e5-small')
    vi.stubEnv('EMBEDDING_SERVICE_URL', SERVICE)
    mockFetch(async () => jsonResponse({ error: 'down' }, false))
    expect(await embed('x', 'query')).toBeNull()
  })

  it('falls back to null when the service request throws (service down)', async () => {
    vi.stubEnv('EMBEDDING_MODEL', 'Xenova/multilingual-e5-small')
    vi.stubEnv('EMBEDDING_SERVICE_URL', SERVICE)
    mockFetch(async () => {
      throw new Error('ECONNREFUSED')
    })
    expect(await embedMany(['a', 'b'], 'passage')).toBeNull()
  })

  it('returns an empty array for empty input without calling the service', async () => {
    vi.stubEnv('EMBEDDING_MODEL', 'Xenova/multilingual-e5-small')
    vi.stubEnv('EMBEDDING_SERVICE_URL', SERVICE)
    const fetchFn = mockFetch(async () => jsonResponse({ vectors: [] }))
    expect(await embedMany([], 'passage')).toEqual([])
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
