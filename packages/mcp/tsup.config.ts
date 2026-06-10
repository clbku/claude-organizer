import { defineConfig } from 'tsup'

// Bundle the MCP server into a single dist/server.mjs that runs with `node`
// alone. Workspace and third-party deps are inlined; Node built-ins stay
// external, and so does `sharp` — a CJS native module that can't be inlined
// into an ESM bundle (dynamic `require`s + platform binaries), so it resolves
// from node_modules at runtime (declared as a real dependency below).
export default defineConfig({
  entry: { server: 'src/server.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  bundle: true,
  // noExternal takes precedence over `external`, so the catch-all regex must
  // itself exclude sharp or the external marking is silently ignored.
  noExternal: [/^(?!sharp$).*/],
  external: ['sharp'],
  outExtension: () => ({ js: '.mjs' }),
  clean: true,
  shims: true
})
