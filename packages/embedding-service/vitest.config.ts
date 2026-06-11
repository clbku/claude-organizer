import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Pure unit tests: the embedder takes an injected config resolver + pipeline
    // loader and the http layer takes an injected embedder, so neither a DB nor
    // the real model is needed.
    environment: 'node'
  }
})
