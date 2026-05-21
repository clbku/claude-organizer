<script setup lang="ts">
import { useProjectStore } from '~/stores/project'
import type { Card, CardStatus } from '~/types/card'
import { cardStatusOrder } from '~/types/card'

const store = useProjectStore()
const { currentProject, currentProjectId } = storeToRefs(store)
const api = useApi()

const { data: activeSprint, refresh: refreshSprint } = useActiveSprint(
  () => currentProjectId.value
)

const { editing, saving, justSaved } = useSprintInlineEdit(
  activeSprint,
  (updated) => {
    activeSprint.value = updated
  }
)

const cards = ref<Card[]>([])
const backlogCards = ref<Card[]>([])
const backlogExpanded = ref(false)
const blockedExpanded = ref(false)
const selectedTagIds = ref<string[]>([])

const filteredCards = computed(() => {
  if (!selectedTagIds.value.length) return cards.value
  const sel = new Set(selectedTagIds.value)
  return cards.value.filter(c => c.tags?.some(t => sel.has(t.id)))
})

async function loadCards() {
  if (!activeSprint.value || !currentProjectId.value) {
    cards.value = []
    backlogCards.value = []
    return
  }
  const projectId = currentProjectId.value
  const [sprintList, backlogList] = await Promise.all([
    api<Card[]>('/cards', {
      query: { projectId, sprintId: activeSprint.value.id }
    }),
    api<Card[]>('/cards', {
      query: { projectId, backlogOnly: 'true' }
    })
  ])
  cards.value = sprintList
  backlogCards.value = backlogList
}

useProjectData(currentProjectId, loadCards, {
  watch: [currentProjectId, activeSprint],
  onEvent: (event) => {
    if (event.type === 'card.changed' || event.type === 'card.deleted') {
      loadCards()
    } else if (event.type === 'sprint.changed') {
      refreshSprint()
    } else if (event.type === 'project.changed') {
      loadCards()
    }
  }
})

const columns = computed<Record<CardStatus, Card[]>>(() => {
  const grouped: Record<CardStatus, Card[]> = {
    todo: [],
    in_progress: [],
    review: [],
    done: [],
    blocked: []
  }
  for (const c of filteredCards.value) grouped[c.status].push(c)
  for (const status of cardStatusOrder) {
    grouped[status].sort((a, b) => a.position - b.position || b.priority - a.priority)
  }
  return grouped
})

async function onCardMoved(cardId: string, toStatus: CardStatus) {
  if (!activeSprint.value) return
  const sprintIdLocal = activeSprint.value.id
  // A card can arrive from the backlog or from another status column.
  const fromBacklogIdx = backlogCards.value.findIndex(c => c.id === cardId)
  const fromSprintIdx = cards.value.findIndex(c => c.id === cardId)
  const body: Record<string, unknown> = { status: toStatus }
  if (fromBacklogIdx !== -1) {
    const card = backlogCards.value[fromBacklogIdx]
    if (!card) return
    body.sprintId = sprintIdLocal
    backlogCards.value.splice(fromBacklogIdx, 1)
    cards.value.push({ ...card, status: toStatus, sprintId: sprintIdLocal })
  } else if (fromSprintIdx !== -1) {
    const prev = cards.value[fromSprintIdx]
    if (!prev || prev.status === toStatus) return
    cards.value[fromSprintIdx] = { ...prev, status: toStatus }
  } else {
    return
  }
  try {
    await api(`/cards/${cardId}`, { method: 'PATCH', body })
  } catch (err) {
    console.error('Failed to update card, reloading', err)
    await loadCards()
  }
}

async function onMoveToBacklog(cardId: string) {
  const idx = cards.value.findIndex(c => c.id === cardId)
  if (idx === -1) return
  const card = cards.value[idx]
  if (!card) return
  cards.value.splice(idx, 1)
  backlogCards.value.push({ ...card, sprintId: null })
  try {
    await api(`/cards/${cardId}`, {
      method: 'PATCH',
      body: { sprintId: null }
    })
  } catch (err) {
    console.error('Failed to move card to backlog, reloading', err)
    await loadCards()
  }
}
</script>

<template>
  <UDashboardPanel
    id="board"
    :ui="{ body: 'flex flex-col gap-4 sm:gap-6 flex-1 overflow-hidden p-4 sm:p-6' }"
  >
    <template #header>
      <UDashboardNavbar
        :title="activeSprint?.name ?? 'Board'"
        :ui="{ left: 'flex-1 min-w-0', title: 'flex-1 min-w-0' }"
      >
        <template #leading>
          <UIcon name="i-lucide-kanban" class="text-primary" />
        </template>
        <template v-if="activeSprint" #title>
          <UInput
            v-model="editing.name"
            variant="ghost"
            size="lg"
            placeholder="Sprint name"
            class="w-full [&_input]:text-lg! [&_input]:font-semibold! [&_input]:px-0!"
          />
        </template>
        <template #right>
          <span
            v-if="saving"
            class="text-xs text-muted mr-2 flex items-center gap-1"
          >
            <UIcon name="i-lucide-loader-2" class="animate-spin" /> Saving…
          </span>
          <span
            v-else-if="justSaved"
            class="text-xs text-muted mr-2 flex items-center gap-1 transition-opacity"
          >
            <UIcon name="i-lucide-check" /> Saved
          </span>
          <UBadge v-if="activeSprint" color="info" variant="subtle">
            active sprint
          </UBadge>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="!currentProject" class="text-center text-muted py-12">
        Pick a project in the sidebar.
      </div>
      <div v-else-if="!activeSprint" class="text-center text-muted py-12">
        No active sprint for <strong>{{ currentProject.name }}</strong>.
        Start one from /sprints.
      </div>
      <template v-else>
        <UTextarea
          v-model="editing.goal"
          variant="ghost"
          :rows="1"
          autoresize
          placeholder="Add a goal for this sprint…"
          class="w-full shrink-0"
          :ui="{ base: 'text-sm text-muted !px-0 resize-none' }"
        />
        <div class="flex items-center justify-end gap-2 shrink-0">
          <BoardTagFilter
            v-model="selectedTagIds"
            :project-id="currentProjectId"
          />
        </div>
        <div class="flex gap-3 flex-1 min-h-0 min-w-0 overflow-x-auto">
          <BacklogColumn
            v-if="backlogExpanded"
            :cards="backlogCards"
            closable
            @card-moved-to-backlog="onMoveToBacklog"
            @close="backlogExpanded = false"
          />
          <CollapsedColumn
            v-else
            icon="i-lucide-inbox"
            label="Backlog"
            :count="backlogCards.length"
            @expand="backlogExpanded = true"
          />
          <template v-for="status in cardStatusOrder" :key="status">
            <template v-if="status === 'blocked'">
              <BoardColumn
                v-if="blockedExpanded"
                :status="status"
                :cards="columns[status]"
                closable
                @card-moved="onCardMoved"
                @close="blockedExpanded = false"
              />
              <CollapsedColumn
                v-else
                icon="i-lucide-ban"
                label="Blocked"
                :count="columns[status].length"
                @expand="blockedExpanded = true"
              />
            </template>
            <BoardColumn
              v-else
              :status="status"
              :cards="columns[status]"
              @card-moved="onCardMoved"
            />
          </template>
        </div>
      </template>
    </template>
  </UDashboardPanel>
</template>
