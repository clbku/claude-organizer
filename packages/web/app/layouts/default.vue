<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const links = computed<NavigationMenuItem[][]>(() => [
  [
    { label: 'Projects', icon: 'i-lucide-folder', to: '/' },
    { label: 'Board', icon: 'i-lucide-kanban', to: '/board' },
    { label: 'Sprints', icon: 'i-lucide-timer', to: '/sprints' },
    { label: 'Backlog', icon: 'i-lucide-inbox', to: '/backlog' },
    { label: 'Docs', icon: 'i-lucide-book', to: '/docs' }
  ]
])
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar collapsible resizable>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-layers" class="text-primary text-xl" />
          <span class="font-semibold">claude-organizer</span>
        </div>
      </template>

      <AppProjectSwitcher />

      <UNavigationMenu
        :items="links"
        orientation="vertical"
        class="-mx-2"
      />
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
