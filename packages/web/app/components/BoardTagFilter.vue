<script setup lang="ts">
import type { Tag } from '~/types/tag'

const props = defineProps<{
  projectId: string | null | undefined
  modelValue: string[]
}>()

const emit = defineEmits<{ 'update:modelValue': [ids: string[]] }>()

const api = useApi()
const tags = ref<Tag[]>([])

async function load() {
  if (!props.projectId) {
    tags.value = []
    return
  }
  tags.value = await api<Tag[]>('/tags', {
    query: { projectId: props.projectId }
  })
}

onMounted(load)
watch(() => props.projectId, load)

const selected = computed<string[]>({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v)
})
</script>

<template>
  <USelectMenu
    v-model="selected"
    :items="tags"
    multiple
    value-key="id"
    label-key="name"
    icon="i-lucide-tag"
    placeholder="Filter by tag"
    :search-input="{ placeholder: 'Search tags…' }"
    class="w-52"
    @update:open="(o: boolean) => o && load()"
  >
    <template #item-leading="{ item }">
      <span
        class="inline-block size-3 shrink-0 self-center rounded-full align-middle"
        :style="{ backgroundColor: (item as Tag).color }"
      />
    </template>
  </USelectMenu>
</template>
