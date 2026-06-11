import { defineConfig } from 'tsup'

// Bundle the MCP server into a single dist/server.mjs that runs with `node`
// alone. Everything is inlined — the MCP is a pure client now (the embedding
// runtime moved to embedding-service), so nothing native stays external.
export default defineConfig({
  entry: { server: 'src/server.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  bundle: true,
  noExternal: [/.*/],
  outExtension: () => ({ js: '.mjs' }),
  clean: true,
  shims: true
})
