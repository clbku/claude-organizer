import { defineConfig } from 'tsup'

// Bundle the MCP server into a single self-contained dist/server.mjs that runs
// with `node` alone — no tsx, no pnpm workspace, no node_modules. Workspace and
// third-party deps are inlined; only Node built-ins stay external.
export default defineConfig({
  entry: { server: 'src/server.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  bundle: true,
  noExternal: [/.*/],
  outExtension: () => ({ js: '.mjs' }),
  clean: true,
  shims: true
})
