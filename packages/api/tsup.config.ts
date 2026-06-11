import { defineConfig } from 'tsup'

// Bundle the API server into a single dist/server.mjs that runs with `node`
// alone (no tsx). Mirrors the mcp build: workspace and third-party deps are
// inlined; only Node built-ins and the embedding runtime stay external.
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
  // The embedding runtime can't be inlined: bundling onnxruntime-node breaks its
  // native backend registration, and sharp ships platform binaries. `core` loads
  // `@huggingface/transformers` via a dynamic import at runtime, resolved from
  // node_modules (a direct dep of this package, so reachable from dist/), only
  // when embeddings are enabled.
  external: ['@huggingface/transformers', 'onnxruntime-node', 'sharp'],
  outExtension: () => ({ js: '.mjs' }),
  clean: true,
  shims: true,
  // @fastify/multipart pulls @fastify/busboy (CJS), which `require('stream')`. In
  // ESM output esbuild's __require shim throws on a dynamic require of a built-in;
  // defining a real `require` via createRequire makes the shim use it instead.
  // esbuild emits the banner into every chunk, so the shared chunks are covered.
  banner: {
    js: 'import { createRequire as __cjsRequire } from \'module\'; const require = __cjsRequire(import.meta.url);'
  }
})
