<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

import { useProjectStore } from '~/stores/project'

const store = useProjectStore()
const { projects } = storeToRefs(store)
const { isAdmin, capabilities } = useAuth()

const version = useRuntimeConfig().public.appVersion

// Creating a project is admin-only (open in sem-auth mode). A scoped `user`
// can't, so onboarding/empty-state must branch on this — forcing the create
// modal on a non-creator would trap them (POST /projects 403s, no escape).
const canCreateProject = computed(
  () => isAdmin.value || !(capabilities.value?.authEnabled ?? true)
)

// First-run onboarding: with no project there's nothing to do, so we force the
// create-project modal (non-dismissable) — but only for someone who can create.
const onboardingOpen = ref(false)
watch(
  [projects, canCreateProject],
  ([list, canCreate]) => {
    onboardingOpen.value = list.length === 0 && canCreate
  },
  { immediate: true }
)

// A scoped user with no accessible projects: nothing to show and nothing to
// create — point them at their admin instead of an empty app.
const noProjectsForUser = computed(
  () => projects.value.length === 0 && !canCreateProject.value
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
  ],
  [
    ...(isAdmin.value
      ? [{ label: 'Usuários', icon: 'i-lucide-users', to: '/admin/users' }]
      : []),
    { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' }
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

    <div
      v-if="noProjectsForUser"
      class="flex-1 flex items-center justify-center p-8"
    >
      <div class="text-center max-w-sm">
        <UIcon name="i-lucide-folder-lock" class="size-8 text-muted mx-auto" />
        <p class="text-sm font-medium mt-2">
          Nenhum projeto liberado
        </p>
        <p class="text-sm text-muted mt-1">
          Você ainda não tem acesso a nenhum projeto. Peça a um administrador
          para liberar um para você.
        </p>
      </div>
    </div>
    <slot v-else />

    <AppCreateProjectModal
      v-model:open="onboardingOpen"
      :dismissible="false"
      description="Create your first project to get started."
      @created="onProjectCreated"
    />
  </UDashboardGroup>
</template>
