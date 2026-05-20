<script setup lang="ts">
import type { Tag } from '~/types/tag'
import { tagTextColor } from '~/types/tag'

const props = withDefaults(
  defineProps<{
    tag: Tag
    removable?: boolean
    size?: 'xs' | 'sm'
  }>(),
  { removable: false, size: 'sm' }
)

defineEmits<{ remove: [] }>()

const style = computed(() => ({
  backgroundColor: props.tag.color,
  color: tagTextColor(props.tag.color)
}))
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded font-medium leading-none whitespace-nowrap"
    :class="size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'"
    :style="style"
  >
    {{ tag.name }}
    <button
      v-if="removable"
      type="button"
      class="-mr-0.5 opacity-70 hover:opacity-100"
      aria-label="Remove tag"
      @click.stop.prevent="$emit('remove')"
    >
      <UIcon name="i-lucide-x" class="size-3 block" />
    </button>
  </span>
</template>
