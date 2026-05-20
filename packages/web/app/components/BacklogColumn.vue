<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'

import type { Card } from '~/types/card'

const props = defineProps<{
  cards: Card[]
  closable?: boolean
}>()

const emit = defineEmits<{
  (e: 'card-moved-to-backlog', cardId: string): void
  (e: 'close'): void
}>()

const localList = ref<Card[]>([...props.cards])

watch(
  () => props.cards,
  (next) => {
    localList.value = [...next]
  },
  { deep: true }
)

function onAdd(event: { data: Card }) {
  const card = event.data
  if (card.sprintId !== null) {
    emit('card-moved-to-backlog', card.id)
  }
}
</script>

<template>
  <div
    class="flex flex-col bg-elevated/20 rounded-lg border border-dashed border-default overflow-hidden h-full"
    style="flex: 1 1 0; min-width: 200px;"
  >
    <div
      class="flex items-center justify-between px-3 py-2 border-b border-default border-dashed shrink-0"
    >
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-inbox" class="text-muted size-4" />
        <span class="text-sm font-semibold text-muted">Backlog</span>
        <span class="text-xs text-muted">{{ cards.length }}</span>
      </div>
      <UButton
        v-if="closable"
        icon="i-lucide-x"
        size="xs"
        color="neutral"
        variant="ghost"
        @click="emit('close')"
      />
    </div>

    <VueDraggable
      v-model="localList"
      :animation="150"
      group="cards"
      ghost-class="opacity-40"
      class="flex flex-col gap-2 p-2 flex-1 overflow-y-auto overflow-x-hidden"
      @add="onAdd"
    >
      <div
        v-for="card in localList"
        :key="card.id"
        class="cursor-grab active:cursor-grabbing min-w-0 shrink-0 bg-default border border-default rounded-md px-2.5 py-2 hover:border-primary/40 transition"
      >
        <div class="flex items-start justify-between gap-2 min-w-0">
          <NuxtLink
            :to="`/cards/${card.key}`"
            class="text-sm leading-snug wrap-break-word min-w-0 hover:underline decoration-primary/40 underline-offset-2"
            @mousedown.stop
          >
            <span class="font-mono font-bold text-default mr-1.5">{{ card.key }}</span>
            <span class="font-medium">{{ card.title }}</span>
          </NuxtLink>
          <UBadge
            v-if="card.priority > 0"
            size="xs"
            variant="soft"
            class="shrink-0"
          >
            P{{ card.priority }}
          </UBadge>
        </div>
        <p
          v-if="card.summary"
          class="text-xs text-muted leading-snug line-clamp-3 mt-1"
        >
          {{ card.summary }}
        </p>
      </div>
    </VueDraggable>
  </div>
</template>
