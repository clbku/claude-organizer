import { describe, expect, it, vi } from 'vitest'

import type { EmbeddingConfig } from '@claude-organizer/shared'

import { createEmbedder, type PipelineLoader } from '../src/embedder'

const e5Config: EmbeddingConfig = {
  model: 'Xenova/multilingual-e5-small',
  dim: 384,
  e5Prefix: true
}
const plainConfig: EmbeddingConfig = { model: 'custom/model', dim: 8, e5Prefix: false }
const disabledConfig: EmbeddingConfig = { model: null, dim: 384, e5Prefix: false }

// A deterministic stand-in for the real pipeline: echoes a vector encoding each
// input text's length, so a test can assert exactly which strings reached it.
function fakeLoader(seen: string[][] = []): PipelineLoader {
  return async () => ({
    run: async (texts: string[]) => {
      seen.push(texts)
      return texts.map(t => [t.length])
    },
    dispose: () => {}
  })
}

describe('createEmbedder', () => {
  it('applies the e5 query/passage prefix before running the pipeline', async () => {
    const seen: string[][] = []
    const embedder = createEmbedder({
      resolveConfig: async () => e5Config,
      loadPipeline: fakeLoader(seen)
    })
    await embedder.embed(['hello'], 'query')
    await embedder.embed(['world'], 'passage')
    expect(seen).toEqual([['query: hello'], ['passage: world']])
  })

  it('skips the prefix for a non-e5 model', async () => {
    const seen: string[][] = []
    const embedder = createEmbedder({
      resolveConfig: async () => plainConfig,
      loadPipeline: fakeLoader(seen)
    })
    await embedder.embed(['raw'], 'query')
    expect(seen).toEqual([['raw']])
  })

  it('returns the same vectors for the same input (deterministic)', async () => {
    const embedder = createEmbedder({
      resolveConfig: async () => e5Config,
      loadPipeline: fakeLoader()
    })
    const a = await embedder.embed(['abc'], 'passage')
    const b = await embedder.embed(['abc'], 'passage')
    expect(a).toEqual(b)
    expect(a).toEqual([['passage: abc'.length]])
  })

  it('loads the model once across many embeds', async () => {
    const load = vi.fn(fakeLoader())
    const embedder = createEmbedder({ resolveConfig: async () => e5Config, loadPipeline: load })
    await embedder.init()
    await embedder.embed(['a'], 'query')
    await embedder.embed(['b'], 'query')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('is disabled (returns null, never loads) when the model is none', async () => {
    const load = vi.fn<PipelineLoader>()
    const embedder = createEmbedder({ resolveConfig: async () => disabledConfig, loadPipeline: load })
    expect(await embedder.embed(['x'], 'query')).toBeNull()
    expect(load).not.toHaveBeenCalled()
    expect(embedder.status()).toMatchObject({ state: 'disabled', model: null })
  })

  it('reports an empty array for empty input without loading', async () => {
    const load = vi.fn<PipelineLoader>()
    const embedder = createEmbedder({ resolveConfig: async () => e5Config, loadPipeline: load })
    expect(await embedder.embed([], 'query')).toEqual([])
    expect(load).not.toHaveBeenCalled()
  })

  it('disposes the old pipeline when reloading to a new model', async () => {
    const dispose = vi.fn()
    let cfg: EmbeddingConfig = e5Config
    const load: PipelineLoader = async () => ({
      run: async (texts: string[]) => texts.map(() => [1]),
      dispose
    })
    const embedder = createEmbedder({ resolveConfig: async () => cfg, loadPipeline: load })
    await embedder.init()
    expect(dispose).not.toHaveBeenCalled()

    cfg = { model: 'Xenova/multilingual-e5-base', dim: 768, e5Prefix: true }
    await embedder.reload()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('disposes the old pipeline when disabled (none) on reload', async () => {
    const dispose = vi.fn()
    let cfg: EmbeddingConfig = e5Config
    const load: PipelineLoader = async () => ({
      run: async (texts: string[]) => texts.map(() => [1]),
      dispose
    })
    const embedder = createEmbedder({ resolveConfig: async () => cfg, loadPipeline: load })
    await embedder.init()

    cfg = disabledConfig
    await embedder.reload()
    expect(dispose).toHaveBeenCalledOnce()
    expect(embedder.status()).toMatchObject({ state: 'disabled', model: null })
    expect(await embedder.embed(['x'], 'query')).toBeNull()
  })

  it('coalesces concurrent reloads into a single load', async () => {
    const load = vi.fn(fakeLoader())
    const embedder = createEmbedder({ resolveConfig: async () => e5Config, loadPipeline: load })
    await embedder.init()
    expect(load).toHaveBeenCalledTimes(1)
    await Promise.all([embedder.reload(), embedder.reload(), embedder.reload()])
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('records the loaded config via onLoaded (model and disabled)', async () => {
    const onLoaded = vi.fn()
    let cfg: EmbeddingConfig = e5Config
    const embedder = createEmbedder({
      resolveConfig: async () => cfg,
      loadPipeline: fakeLoader(),
      onLoaded
    })
    await embedder.init()
    expect(onLoaded).toHaveBeenLastCalledWith(e5Config)

    cfg = disabledConfig
    await embedder.reload()
    expect(onLoaded).toHaveBeenLastCalledWith(disabledConfig)
  })

  it('degrades to null (state error) when the model fails to load', async () => {
    const onLoaded = vi.fn()
    const embedder = createEmbedder({
      resolveConfig: async () => e5Config,
      loadPipeline: async () => {
        throw new Error('boom')
      },
      onLoaded
    })
    expect(await embedder.embed(['x'], 'query')).toBeNull()
    expect(embedder.status().state).toBe('error')
    expect(onLoaded).not.toHaveBeenCalled()
  })
})
