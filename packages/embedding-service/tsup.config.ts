import { defineConfig } from 'tsup'

// Bundle the embedding service into a single dist/server.mjs that runs with
// `node` alone. This is the ONLY service that loads the model, so the embedding
// runtime (transformers + its native onnxruntime/sharp) stays external here and
// is gone from the api/mcp bundles.
export default defineConfig({
  entry: { server: 'src/server.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  bundle: true,
  // Inline everything EXCEPT the embedding runtime. The negative lookahead is
  // required: a bare `noExternal: [/.*/]` would force-bundle them back in even
  // when listed in `external` (noExternal wins in tsup).
  noExternal: [/^(?!@huggingface\/transformers|onnxruntime-node|sharp)/],
  // Bundling onnxruntime-node breaks its native backend registration
  // (`listSupportedBackends is not a function`) and sharp ships platform
  // binaries. transformers is loaded via a dynamic import at runtime, resolved
  // from node_modules (a direct dep of this package), only when a model is set.
  external: ['@huggingface/transformers', 'onnxruntime-node', 'sharp'],
  outExtension: () => ({ js: '.mjs' }),
  clean: true,
  shims: true
})
