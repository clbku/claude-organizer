export default defineNuxtConfig({
  compatibilityDate: "2026-01-01",
  future: { compatibilityVersion: 4 },
  devtools: { enabled: true },
  modules: ["@nuxt/ui", "@pinia/nuxt"],
  css: ["~/assets/css/main.css"],
  runtimeConfig: {
    public: {
      apiUrl: process.env.NUXT_PUBLIC_API_URL ?? "http://127.0.0.1:4400",
    },
  },
  typescript: { strict: true },
  vite: {
    optimizeDeps: {
      include: ["vue-draggable-plus"],
    },
  },
});
