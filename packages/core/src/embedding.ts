export type EmbeddingKind = 'query' | 'passage'

// The dedicated embedding service holds the model; this module is a thin HTTP
// client. `null` on any failure (service down, timeout, disabled) so callers fall
// back to lexical search — the same invariant as when the model failed to load.
// Env is read per call (not captured at import) so deploys/tests don't need a
// reload to change it.
async function requestEmbed(
  texts: string[],
  kind: EmbeddingKind
): Promise<number[][] | null> {
  const serviceUrl = process.env.EMBEDDING_SERVICE_URL?.trim()
  // Deploy-level disable: `EMBEDDING_MODEL=none` means the client never calls the
  // service (a runtime "none" set via the UI is handled service-side instead).
  const deployDisabled = process.env.EMBEDDING_MODEL?.trim() === 'none'
  if (deployDisabled || !serviceUrl) return null
  // Generous: covers a still-warming service and large backfill batches; a true
  // hang still falls back to lexical instead of stalling the caller forever.
  const timeoutMs = Number(process.env.EMBEDDING_TIMEOUT_MS ?? 30_000)
  try {
    const res = await fetch(`${serviceUrl}/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texts, kind }),
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (!res.ok) return null
    const data = (await res.json()) as { vectors?: number[][] | null }
    return data.vectors ?? null
  } catch (err) {
    console.error('[embedding] service request failed; falling back to lexical', err)
    return null
  }
}

/**
 * Embed many texts in one pass (the e5 prefix is applied service-side per `kind`).
 * Returns the unit-normalized vectors, or `null` when embeddings are
 * disabled/unavailable so callers fall back to lexical search.
 */
export async function embedMany(
  texts: string[],
  kind: EmbeddingKind
): Promise<number[][] | null> {
  if (texts.length === 0) return []
  return requestEmbed(texts, kind)
}

/** Embed a single text; `null` when embeddings are disabled/unavailable. */
export async function embed(
  text: string,
  kind: EmbeddingKind
): Promise<number[] | null> {
  const vectors = await embedMany([text], kind)
  return vectors ? (vectors[0] ?? null) : null
}

/**
 * Ask the embedding service to re-resolve the persisted config and reload its
 * pipeline (disposing the old one). Awaited by the apply so the subsequent
 * backfill embeds in the new model. Best-effort: returns `false` (never throws)
 * when the service is unreachable — the persisted choice still wins and the
 * service converges on its next boot/reload. The reload load can be slow (cold
 * download), so the timeout is generous.
 */
export async function reloadEmbeddingService(): Promise<boolean> {
  const serviceUrl = process.env.EMBEDDING_SERVICE_URL?.trim()
  if (!serviceUrl) return false
  const timeoutMs = Number(process.env.EMBEDDING_RELOAD_TIMEOUT_MS ?? 300_000)
  try {
    const res = await fetch(`${serviceUrl}/reload`, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs)
    })
    return res.ok
  } catch (err) {
    console.error('[embedding] service reload failed; it will converge on the persisted model', err)
    return false
  }
}

/**
 * Generic embedding backfill loop shared by the docs/cards/comments verticals.
 * Pulls batches of `{ id, text }` still missing an embedding, embeds each
 * (`passage`), and stores it. Idempotent; stops early (returning the count so
 * far) the moment an embed yields `null` — embeddings are disabled/unavailable,
 * so there's no point scanning the rest. The caller supplies the table-specific
 * fetch (mapping its rows to id + content text) and store.
 */
export async function backfillEmbeddings(
  batchSize: number,
  fetchBatch: (limit: number) => Promise<Array<{ id: string, text: string }>>,
  embedOne: (text: string) => Promise<number[] | null>,
  store: (id: string, embedding: number[]) => Promise<unknown>
): Promise<number> {
  let total = 0
  for (;;) {
    const rows = await fetchBatch(batchSize)
    if (rows.length === 0) break
    for (const row of rows) {
      const embedding = await embedOne(row.text)
      if (!embedding) return total
      await store(row.id, embedding)
      total++
    }
    if (rows.length < batchSize) break
  }
  return total
}
