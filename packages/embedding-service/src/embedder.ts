import type { EmbeddingConfig } from '@claude-organizer/shared'
import { DEFAULT_EMBEDDING_DIM } from '@claude-organizer/shared'

export type EmbeddingKind = 'query' | 'passage'

export type EmbedderState = 'loading' | 'ready' | 'disabled' | 'error'

export interface EmbedderStatus {
  state: EmbedderState
  model: string | null
  dim: number
}

/** Runs the loaded pipeline over already-prefixed texts, returning unit-normalized vectors. */
export type RunFn = (texts: string[]) => Promise<number[][]>

export interface LoadedPipeline {
  run: RunFn
  /** Frees the onnxruntime InferenceSession; called before the reference is dropped. */
  dispose: () => Promise<void> | void
}

export type PipelineLoader = (cfg: EmbeddingConfig) => Promise<LoadedPipeline>

export interface EmbedderOptions {
  resolveConfig: () => Promise<EmbeddingConfig>
  loadPipeline?: PipelineLoader
  /** Called after each successful (re)load with the config the service now serves. */
  onLoaded?: (cfg: EmbeddingConfig) => Promise<void> | void
}

export interface Embedder {
  /** Trigger the initial model load (idempotent). */
  init: () => Promise<void>
  /** Re-resolve the effective config and reload the pipeline (disposing the old). */
  reload: () => Promise<void>
  status: () => EmbedderStatus
  embed: (texts: string[], kind: EmbeddingKind) => Promise<number[][] | null>
}

const defaultLoadPipeline: PipelineLoader = async (cfg) => {
  const { pipeline, env } = await import('@huggingface/transformers')
  // Transformers.js ignores HF_HOME/TRANSFORMERS_CACHE — the weights cache dir is
  // only overridable programmatically. Point it at a stable path (a mounted
  // volume in Docker) so the weights survive a rebuild instead of re-downloading.
  const cacheDir = process.env.EMBEDDING_CACHE_DIR?.trim()
  if (cacheDir) env.cacheDir = cacheDir
  const dtype = process.env.EMBEDDING_DTYPE?.trim() || 'fp32'
  const pipe = await pipeline('feature-extraction', cfg.model!, {
    dtype
  } as Record<string, unknown>)
  return {
    run: async (texts) => {
      const out = await pipe(texts, { pooling: 'mean', normalize: true })
      return out.tolist() as number[][]
    },
    dispose: () => pipe.dispose?.()
  }
}

export function createEmbedder({
  resolveConfig,
  loadPipeline = defaultLoadPipeline,
  onLoaded
}: EmbedderOptions): Embedder {
  let cfg: EmbeddingConfig | null = null
  let loaded: LoadedPipeline | null = null
  let state: EmbedderState = 'loading'
  let loadingPromise: Promise<void> | null = null
  let reloadInFlight: Promise<void> | null = null

  async function doLoad(): Promise<void> {
    state = 'loading'
    // Dispose the old session BEFORE loading the new one: peak stays at a single
    // model so memory doesn't ratchet up ~2x per swap (the native allocator keeps
    // the peak as RSS). The brief no-model window degrades to lexical (an embed
    // mid-reload just awaits the new load) — the accepted trade-off.
    const previous = loaded
    loaded = null
    if (previous) {
      try {
        await previous.dispose()
      } catch (err) {
        console.error('[embedding-service] disposing the old pipeline failed', err)
      }
    }
    const nextCfg = await resolveConfig()
    let next: LoadedPipeline | null = null
    if (nextCfg.model) {
      try {
        next = await loadPipeline(nextCfg)
      } catch (err) {
        console.error('[embedding-service] model load failed; semantic search off', err)
      }
    }
    cfg = nextCfg
    loaded = next
    state = !nextCfg.model ? 'disabled' : next ? 'ready' : 'error'
    if (state !== 'error') await onLoaded?.(nextCfg)
  }

  function ensureLoaded(): Promise<void> {
    if (!loadingPromise) loadingPromise = doLoad()
    return loadingPromise
  }

  return {
    init: ensureLoaded,
    reload: () => {
      // Coalesce concurrent reloads — never load twice in parallel.
      if (reloadInFlight) return reloadInFlight
      loadingPromise = doLoad()
      reloadInFlight = loadingPromise.finally(() => {
        reloadInFlight = null
      })
      return reloadInFlight
    },
    status: () => ({
      state,
      model: cfg?.model ?? null,
      dim: cfg?.dim ?? DEFAULT_EMBEDDING_DIM
    }),
    embed: async (texts, kind) => {
      if (texts.length === 0) return []
      await ensureLoaded()
      if (!loaded) return null
      try {
        const prefixed = cfg?.e5Prefix
          ? texts.map(t => `${kind}: ${t}`)
          : texts
        return await loaded.run(prefixed)
      } catch (err) {
        console.error('[embedding-service] inference failed; caller falls back to lexical', err)
        return null
      }
    }
  }
}
