<script setup lang="ts">
import type { DocNode } from '~/types/doc'
import { docKindMeta } from '~/types/doc'

defineProps<{
  node: DocNode
  selectedId: string | null
  depth: number
}>()

defineEmits<{
  (e: 'select', id: string): void
}>()
</script>

<template>
  <div>
    <button
      type="button"
      :title="node.summary ?? undefined"
      class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left hover:bg-elevated/50 transition"
      :class="selectedId === node.id ? 'bg-elevated text-highlighted font-medium' : 'text-default'"
      :style="{ paddingLeft: `${depth * 14 + 8}px` }"
      @click="$emit('select', node.id)"
    >
      <UIcon
        :name="docKindMeta[node.kind].icon"
        class="size-4 shrink-0"
        :class="`text-${docKindMeta[node.kind].color}`"
      />
      <span class="truncate">{{ node.title }}</span>
    </button>
    <DocTreeNode
      v-for="child in node.children"
      :key="child.id"
      :node="child"
      :selected-id="selectedId"
      :depth="depth + 1"
      @select="$emit('select', $event)"
    />
  </div>
</template>
