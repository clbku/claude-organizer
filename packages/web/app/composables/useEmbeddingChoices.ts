import { EMBEDDING_DTYPES, EMBEDDING_MODELS } from '@claude-organizer/shared'

// Select items for the embedding model + dtype pickers, built from the shared
// registry so the config (settings) and setup (login) screens never drift.
export function useEmbeddingChoices() {
  const modelItems = [
    ...Object.entries(EMBEDDING_MODELS).map(([id, info]) => ({
      label: `${id} (${info.dim}d)`,
      value: id
    })),
    { label: 'Disabled — lexical search only', value: 'none' }
  ]
  const dtypeItems = EMBEDDING_DTYPES.map(dtype => ({ label: dtype, value: dtype }))
  return { modelItems, dtypeItems }
}
