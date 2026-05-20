<script setup lang="ts">
// Narrow vertical "tab" that stands in for a collapsed board column (backlog,
// archived, blocked). Click to expand. Shared by the board and the sprint view.
defineProps<{
  icon: string
  label: string
  count?: number
}>()
const emit = defineEmits<{ (e: 'expand'): void }>()
</script>

<template>
  <button
    type="button"
    class="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-default hover:bg-elevated/40 hover:border-primary/40 transition shrink-0 py-3"
    style="width: 36px"
    @click="emit('expand')"
  >
    <UIcon :name="icon" class="size-4 text-muted" />
    <span
      class="text-xs font-semibold text-muted whitespace-nowrap"
      style="writing-mode: vertical-rl; transform: rotate(180deg)"
    >
      {{ label }}<template v-if="count !== undefined"> ({{ count }})</template>
    </span>
  </button>
</template>
