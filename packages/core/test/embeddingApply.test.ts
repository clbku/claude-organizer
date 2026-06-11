import { beforeEach, describe, expect, it, vi } from 'vitest'

// Record reload vs backfill order. backfillDoc/Card/CommentEmbeddings all funnel
// through the `backfillEmbeddings` primitive in this same module, so mocking just
// `../src/embedding` intercepts both the reload push and every backfill.
const { calls, reloadMock } = vi.hoisted(() => ({
  calls: [] as string[],
  reloadMock: vi.fn(async () => {
    return true
  })
}))

vi.mock('../src/embedding', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/embedding')>()
  return {
    ...real,
    reloadEmbeddingService: vi.fn(async () => {
      calls.push('reload')
      return reloadMock()
    }),
    backfillEmbeddings: vi.fn(async () => {
      calls.push('backfill')
      return 0
    })
  }
})

import type { Database } from '@claude-organizer/db'

import { applyEmbeddingModel, getEmbeddingStatus, setEmbeddingModel } from '../src/index'
import { useTestDb } from './helpers'

const ctx = useTestDb()

async function settle(db: Database) {
  for (let i = 0; i < 200; i++) {
    const s = await getEmbeddingStatus(db)
    if (s.state === 'done' || s.state === 'error') return s
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('apply did not settle')
}

beforeEach(() => {
  calls.length = 0
  reloadMock.mockClear()
})

describe('applyEmbeddingModel reload ordering', () => {
  it('pushes a /reload to the service before the backfill runs', async () => {
    await setEmbeddingModel(ctx.db, null)
    await applyEmbeddingModel(ctx.db, 'none')
    await settle(ctx.db)

    expect(reloadMock).toHaveBeenCalledOnce()
    expect(calls[0]).toBe('reload')
    expect(calls.indexOf('reload')).toBeLessThan(calls.indexOf('backfill'))

    await setEmbeddingModel(ctx.db, null)
  })
})
