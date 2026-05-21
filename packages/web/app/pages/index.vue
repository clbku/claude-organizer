<script setup lang="ts">
import { useProjectStore } from '~/stores/project'

const store = useProjectStore()
const { projects, currentProject } = storeToRefs(store)

const open = ref(false)

function selectProject(slug: string) {
  store.setCurrent(slug)
}
</script>

<template>
  <UDashboardPanel id="projects">
    <template #header>
      <UDashboardNavbar title="Projects">
        <template #right>
          <UButton
            icon="i-lucide-plus"
            color="primary"
            label="New project"
            @click="open = true"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="!projects.length" class="text-center text-muted py-12">
        No projects yet. Create one to start.
      </div>
      <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <UCard
          v-for="p in projects"
          :key="p.id"
          :class="
            p.slug === currentProject?.slug
              ? 'ring-2 ring-primary cursor-pointer transition'
              : 'cursor-pointer hover:ring-1 hover:ring-default transition'
          "
          @click="selectProject(p.slug)"
        >
          <template #header>
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium truncate">{{ p.name }}</span>
              <UBadge variant="soft" size="sm">
                {{ p.keyPrefix }}
              </UBadge>
            </div>
          </template>
          <p class="text-sm text-muted">
            {{ p.description ?? "no description" }}
          </p>
          <p class="text-xs text-muted/60 font-mono mt-2">
            {{ p.slug }}
          </p>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>

  <AppCreateProjectModal v-model:open="open" />
</template>
