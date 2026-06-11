/**
 * Embedding model registry + config resolution, in `shared` (zero-dep) so both
 * `core` (loads the model to embed) and `db` (reconciles the pgvector column to
 * the model's dimension) read the SAME source of truth.
 *
 * The model is chosen via `EMBEDDING_MODEL`; its vector dimension drives the
 * `vector(N)` column. `'none'` disables semantic search (lexical-only fallback).
 * A model outside the registry still works if the operator supplies its size via
 * `EMBEDDING_DIM` — the `e5Prefix` convention then defaults off (it is e5-only).
 */

export interface EmbeddingModelInfo {
  dim: number
  multilingual: boolean
  /** e5 models require `query:`/`passage:` prefixes; other families don't. */
  e5Prefix: boolean
}

// Xenova mirrors of the intfloat e5 models: same architecture/dims/prefix, but
// their onnx/ folder ships standard quantized variants (model_quantized.onnx =
// int8, ~118MB vs ~470MB fp32) selectable via EMBEDDING_DTYPE. The original
// intfloat repos only ship fp32 + a CPU-specific avx512-vnni int8, so q8 can't
// be selected there.
export const EMBEDDING_MODELS: Record<string, EmbeddingModelInfo> = {
  'Xenova/multilingual-e5-small': { dim: 384, multilingual: true, e5Prefix: true },
  'Xenova/multilingual-e5-base': { dim: 768, multilingual: true, e5Prefix: true },
  'Xenova/multilingual-e5-large': { dim: 1024, multilingual: true, e5Prefix: true }
}

export const DEFAULT_EMBEDDING_MODEL = 'Xenova/multilingual-e5-small'

/** Baseline column dimension (the default model's), used when embeddings are off. */
export const DEFAULT_EMBEDDING_DIM = EMBEDDING_MODELS[DEFAULT_EMBEDDING_MODEL]!.dim

/** pgvector's hnsw/ivfflat indexes top out at 2000 dims. */
const MAX_EMBEDDING_DIM = 2000

// The quantized weight variants every Xenova/* mirror publishes (model_quantized
// = q8). Fixed list — not per-model — since all three e5 sizes ship the same set.
// q8 (~118MB) over fp32 (~470MB) is the factory default; the dim is identical
// across dtypes, so switching is lazy (no re-embed — see EmbeddingConfig.dtype).
export const EMBEDDING_DTYPES = ['fp32', 'fp16', 'q8'] as const
export type EmbeddingDtype = (typeof EMBEDDING_DTYPES)[number]

export const DEFAULT_EMBEDDING_DTYPE: EmbeddingDtype = 'q8'

export interface EmbeddingConfig {
  /** The model id to load, or `null` when embeddings are disabled. */
  model: string | null
  /** Vector dimension of the column (always set, even when disabled). */
  dim: number
  e5Prefix: boolean
  /** Quantization variant the pipeline loads (same dim across dtypes, so a change
   *  is lazy: reload only, no re-embed). Always set, even when disabled. */
  dtype: EmbeddingDtype
}

/** Key the embedding service records its loaded model under (writer + reader). */
export const EMBEDDING_RUNTIME_SERVICE = 'embedding'

/** State of an in-flight (or last) runtime model swap; `idle` ⇒ none this process. */
export type EmbeddingRuntimeState
  = | 'idle'
    | 'reconciling'
    | 'backfilling'
    | 'done'
    | 'error'

/** Effective embedding config + progress of the last/ongoing model swap (CO-252). */
export interface EmbeddingRuntimeStatus {
  state: EmbeddingRuntimeState
  model: string | null
  dim: number
  enabled: boolean
  /** A dim change dropped the old vectors → search is lexical-only until backfill ends. */
  dimChanged: boolean
  /** The model the embedding service reports having actually loaded (null = unknown/
   *  disabled). Differs from `model` only briefly while a reload is settling. */
  serviceModel: string | null
  /** Effective quantization the config resolves to (always set). */
  dtype: EmbeddingDtype
  /** The dtype the embedding service reports having loaded (null = unknown/never
   *  recorded, or embeddings disabled — no pipeline loaded a dtype). Otherwise
   *  differs from `dtype` only briefly while a reload is settling. */
  serviceDtype: EmbeddingDtype | null
  backfill: { docs: number, cards: number, comments: number }
  error: string | null
}

type Env = Record<string, string | undefined>

// `shared` is zero-dep (no @types/node), so reach process.env via globalThis.
function readProcessEnv(): Env {
  const g = globalThis as { process?: { env?: Env } }
  return g.process?.env ?? {}
}

/**
 * Resolve the quantization variant. Precedence: a persisted `overrideDtype` (the
 * UI choice in `systemSettings`) wins over `EMBEDDING_DTYPE`, which wins over the
 * default (`q8`). Throws on a value outside the fixed list so a typo fails fast.
 * The dim is identical across dtypes, so this never affects the column shape.
 */
function resolveEmbeddingDtype(env: Env, overrideDtype?: string | null): EmbeddingDtype {
  const raw = overrideDtype?.trim() || env.EMBEDDING_DTYPE?.trim()
  if (!raw) return DEFAULT_EMBEDDING_DTYPE
  if (!(EMBEDDING_DTYPES as readonly string[]).includes(raw)) {
    throw new Error(
      `Unknown EMBEDDING_DTYPE "${raw}". Use one of: ${EMBEDDING_DTYPES.join(', ')}.`
    )
  }
  return raw as EmbeddingDtype
}

/**
 * Resolve the active embedding config. Precedence: a persisted `overrideModel`
 * (the UI choice in `systemSettings`) wins over `EMBEDDING_MODEL`, which wins over
 * the default. `overrideModel` carries only the model id (`'none'`, a registry id,
 * or a custom id); the dim of a custom override still comes from `EMBEDDING_DIM`.
 * The dtype resolves independently (`overrideDtype` > env > default) and is set
 * even when embeddings are disabled. Throws on a bad config (unknown model with no
 * `EMBEDDING_DIM`, an out-of-range dim, or an unknown dtype) so a typo fails fast
 * instead of silently embedding into the wrong space.
 */
export function resolveEmbeddingConfig(
  env: Env = readProcessEnv(),
  overrideModel?: string | null,
  overrideDtype?: string | null
): EmbeddingConfig {
  const dtype = resolveEmbeddingDtype(env, overrideDtype)
  const raw = overrideModel?.trim() || env.EMBEDDING_MODEL?.trim()
  if (raw === 'none') {
    return { model: null, dim: DEFAULT_EMBEDDING_DIM, e5Prefix: false, dtype }
  }
  const model = raw || DEFAULT_EMBEDDING_MODEL
  const known = EMBEDDING_MODELS[model]
  if (known) return { model, dim: known.dim, e5Prefix: known.e5Prefix, dtype }

  const dimRaw = env.EMBEDDING_DIM?.trim()
  if (!dimRaw) {
    throw new Error(
      `Unknown EMBEDDING_MODEL "${model}". Use one of: ${Object.keys(EMBEDDING_MODELS).join(', ')}, set 'none' to disable, or provide EMBEDDING_DIM for a custom model.`
    )
  }
  const dim = Number(dimRaw)
  if (!Number.isInteger(dim) || dim < 1 || dim > MAX_EMBEDDING_DIM) {
    throw new Error(`EMBEDDING_DIM must be an integer in 1..${MAX_EMBEDDING_DIM}, got "${dimRaw}".`)
  }
  return { model, dim, e5Prefix: false, dtype }
}
