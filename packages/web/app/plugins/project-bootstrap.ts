import type { Pinia } from 'pinia'

import { useProjectStore } from '~/stores/project'

// Inside a Nuxt plugin we're outside an injection-aware context, so the active
// Pinia isn't set — pass the instance explicitly (nuxtApp.$pinia, provided by
// @pinia/nuxt) instead of relying on getActivePinia(). The module's type
// augmentation isn't visible here, hence the cast.
// See pinia.vuejs.org/core-concepts/outside-component-usage.
export default defineNuxtPlugin(async (nuxtApp) => {
  const store = useProjectStore(nuxtApp.$pinia as Pinia)
  await store.ensureLoaded()
})
