export default defineNuxtConfig({
  // SPA: all data fetching happens in the browser, so only the public API URL
  // matters (no SSR/internal-URL split). See ADR "MCP remoto via HTTP" sibling
  // decision for the Docker stack (CO-65).
  ssr: false,
  modules: ['@nuxt/ui', '@pinia/nuxt', '@nuxt/eslint'],
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      apiUrl: process.env.NUXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4400'
    }
  },
  future: { compatibilityVersion: 4 },
  compatibilityDate: '2026-01-01',
  vite: {
    optimizeDeps: {
      include: [
        '@nuxt/ui > prosemirror-gapcursor',
        '@nuxt/ui > prosemirror-model',
        '@nuxt/ui > prosemirror-state',
        '@nuxt/ui > prosemirror-transform',
        '@nuxt/ui > prosemirror-view',
        'marked',
        'vue-draggable-plus'
      ]
    }
  },
  typescript: { strict: true },
  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
