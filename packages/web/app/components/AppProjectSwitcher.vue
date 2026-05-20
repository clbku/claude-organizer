<script setup lang="ts">
import { useProjectStore } from '~/stores/project'

const store = useProjectStore()
const { projects, currentProject } = storeToRefs(store)

const items = computed(() =>
  projects.value.map(p => ({
    label: p.name,
    description: p.slug,
    icon: 'i-lucide-folder',
    onSelect: () => store.setCurrent(p.slug),
    active: p.slug === currentProject.value?.slug
  }))
)
</script>

<template>
  <UDropdownMenu :items="[items]" :ui="{ content: 'min-w-64' }">
    <UButton
      color="neutral"
      variant="ghost"
      trailing-icon="i-lucide-chevron-down"
      class="w-full justify-between"
    >
      <template #default>
        <span v-if="currentProject" class="flex items-center gap-2">
          <UIcon name="i-lucide-folder" class="text-primary" />
          <span class="truncate font-medium">{{ currentProject.name }}</span>
        </span>
        <span v-else class="text-muted text-sm">No project</span>
      </template>
    </UButton>
  </UDropdownMenu>
</template>
