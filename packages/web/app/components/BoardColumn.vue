<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'

import type { Card, CardStatus } from '~/types/card'
import { cardStatusMeta } from '~/types/card'

const props = withDefaults(
  defineProps<{
    status: CardStatus
    cards: Card[]
    closable?: boolean
    /** Group child cards under their story (envelope), Jira-style. */
    groupByStory?: boolean
    /** parentKey -> story title, for the envelope headers. */
    parentTitles?: Record<string, string>
  }>(),
  { groupByStory: false, parentTitles: () => ({}) }
)

const emit = defineEmits<{
  (e: 'reorder', payload: { status: CardStatus, orderedIds: string[], movedId?: string }): void
  (e: 'close'): void
}>()

const meta = computed(() => cardStatusMeta[props.status])

// When grouping by story, keep cards of the same story contiguous and order the
// groups (and standalone cards) by position/priority, so a group interleaves
// with loose cards. Otherwise keep the order the parent gave us.
const orderedCards = computed<Card[]>(() => {
  if (!props.groupByStory) return props.cards
  const clusters = new Map<string, Card[]>()
  for (const c of props.cards) {
    const key = c.parentKey ?? `solo:${c.id}`
    const arr = clusters.get(key) ?? []
    arr.push(c)
    clusters.set(key, arr)
  }
  const blocks = [...clusters.values()].map((cs) => {
    const sorted = [...cs].sort(
      (a, b) => a.position - b.position || b.priority - a.priority
    )
    return {
      cs: sorted,
      pos: Math.min(...sorted.map(c => c.position)),
      prio: Math.max(...sorted.map(c => c.priority))
    }
  })
  blocks.sort((a, b) => a.pos - b.pos || b.prio - a.prio)
  return blocks.flatMap(b => b.cs)
})

const localList = ref<Card[]>([])
watch(orderedCards, next => (localList.value = [...next]), {
  immediate: true,
  deep: true
})

const groupKeyOf = (c?: Card) =>
  props.groupByStory ? (c?.parentKey ?? null) : null
const isGroupStart = (i: number) => {
  const k = groupKeyOf(localList.value[i])
  return k !== null && groupKeyOf(localList.value[i - 1]) !== k
}
const isGroupEnd = (i: number) => {
  const k = groupKeyOf(localList.value[i])
  return k !== null && groupKeyOf(localList.value[i + 1]) !== k
}
const inGroup = (c: Card) => props.groupByStory && !!c.parentKey

// SortableJS has already updated `localList` (v-model) by the time these fire,
// so it reflects the dropped order. `@add` = a card came from another column
// (carries the moved id so the page can apply status/sprint); `@update` = a
// reorder within this column. Either way we hand the page the new column order.
function onAdd(event: { data: Card }) {
  emit('reorder', {
    status: props.status,
    orderedIds: localList.value.map(c => c.id),
    movedId: event.data?.id
  })
}
function onUpdate() {
  emit('reorder', {
    status: props.status,
    orderedIds: localList.value.map(c => c.id)
  })
}
</script>

<template>
  <div
    class="flex flex-col bg-elevated/40 rounded-lg border border-default overflow-hidden h-full"
    style="flex: 1 1 0; min-width: 200px;"
  >
    <div
      class="flex items-center justify-between px-3 py-2 border-b border-default shrink-0"
    >
      <div class="flex items-center gap-2">
        <UBadge :color="meta.color" variant="subtle" size="sm">
          {{ meta.label }}
        </UBadge>
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
      class="flex flex-col p-2 flex-1 overflow-y-auto overflow-x-hidden"
      @add="onAdd"
      @update="onUpdate"
    >
      <div
        v-for="(card, i) in localList"
        :key="card.id"
        class="cursor-grab active:cursor-grabbing min-w-0 shrink-0"
        :class="[
          i > 0 && (!inGroup(card) || isGroupStart(i)) ? 'mt-2' : '',
          inGroup(card) && 'bg-elevated/40 border-x border-default',
          inGroup(card) && isGroupStart(i) && 'border-t rounded-t-lg',
          inGroup(card) && isGroupEnd(i) && 'border-b rounded-b-lg'
        ]"
      >
        <!-- Story envelope: a tinted rail spans the group; the header sits on
             the first child and each inner card keeps a margin, so the children
             read as nested inside the envelope. One model item per draggable. -->
        <NuxtLink
          v-if="isGroupStart(i)"
          :to="`/cards/${card.parentKey}`"
          class="flex items-center gap-1.5 px-2.5 pt-2 pb-1 text-xs hover:underline decoration-primary/40 underline-offset-2"
          @mousedown.stop
        >
          <UIcon name="i-lucide-layers" class="size-3.5 text-primary shrink-0" />
          <span class="font-mono font-bold text-default">{{ card.parentKey }}</span>
          <span class="text-muted truncate">{{ parentTitles[card.parentKey ?? ''] ?? '' }}</span>
        </NuxtLink>

        <div
          class="bg-default border border-default rounded-md px-2.5 py-2 hover:border-primary/40 transition"
          :class="inGroup(card) && 'mx-1.5 mb-1.5'"
        >
          <div
            v-if="card.parentKey && !groupByStory"
            class="mb-1 flex items-center gap-1 text-xs text-muted"
          >
            <UIcon name="i-lucide-corner-down-right" class="size-3 shrink-0" />
            <span class="font-mono">{{ card.parentKey }}</span>
          </div>
          <div
            v-if="card.blockedByPending"
            class="mb-1 flex items-center gap-1 text-xs text-error"
          >
            <UIcon name="i-lucide-ban" class="size-3 shrink-0" />
            <span>bloqueado</span>
          </div>
          <div class="flex items-start justify-between gap-2 min-w-0">
            <NuxtLink
              :to="`/cards/${card.key}`"
              class="text-sm leading-snug wrap-break-word min-w-0 hover:underline decoration-primary/40 underline-offset-2"
              @mousedown.stop
            >
              <span class="font-mono font-bold text-default mr-1.5">{{ card.key }}</span>
              <span class="font-medium">{{ card.title }}</span>
            </NuxtLink>
            <div class="flex shrink-0 items-center gap-1">
              <UBadge
                v-if="card.subtaskCount"
                size="xs"
                variant="soft"
                color="neutral"
                icon="i-lucide-list-tree"
              >
                {{ card.subtaskDone }}/{{ card.subtaskCount }}
              </UBadge>
              <UBadge v-if="card.priority > 0" size="xs" variant="soft">
                P{{ card.priority }}
              </UBadge>
            </div>
          </div>
          <p
            v-if="card.summary"
            class="text-xs text-muted leading-snug line-clamp-3 mt-1"
          >
            {{ card.summary }}
          </p>
          <div v-if="card.tags?.length" class="flex flex-wrap gap-1 mt-1.5">
            <TagBadge
              v-for="t in card.tags"
              :key="t.id"
              :tag="t"
              size="xs"
            />
          </div>
        </div>
      </div>
    </VueDraggable>
  </div>
</template>
