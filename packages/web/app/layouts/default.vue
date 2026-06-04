<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

import { useProjectStore } from '~/stores/project'

const store = useProjectStore()
const { projects } = storeToRefs(store)

const version = useRuntimeConfig().public.appVersion

// First-run onboarding: with no project there's nothing to do in the app, so we
// force the create-project modal open (non-dismissable) until one exists. The
// modal already selects the new project; here we just send the user home after.
const onboardingOpen = ref(false)
watch(
  projects,
  (list) => {
    onboardingOpen.value = list.length === 0
  },
  { immediate: true }
)

function onProjectCreated() {
  navigateTo('/')
}

const links = computed<NavigationMenuItem[][]>(() => [
  [
    { label: 'Home', icon: 'i-lucide-home', to: '/' },
    { label: 'Inbox', icon: 'i-lucide-inbox', to: '/inbox' },
    { label: 'Board', icon: 'i-lucide-kanban', to: '/board' },
    { label: 'Sprints', icon: 'i-lucide-timer', to: '/sprints' },
    { label: 'Tasks', icon: 'i-lucide-list-todo', to: '/tasks' },
    { label: 'Docs', icon: 'i-lucide-book', to: '/docs' }
  ]
])
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar collapsible resizable>
      <template #header>
        <AppProjectSwitcher />
      </template>

      <UNavigationMenu
        :items="links"
        orientation="vertical"
        class="-mx-2"
      />

      <template #footer="{ collapsed }">
        <span v-if="!collapsed" class="block w-full text-center text-xs text-muted pb-2">v{{ version }}</span>
      </template>
    </UDashboardSidebar>

    <slot />

    <AppCreateProjectModal
      v-model:open="onboardingOpen"
      :dismissible="false"
      description="Create your first project to get started."
      @created="onProjectCreated"
    />
  </UDashboardGroup>
</template>
