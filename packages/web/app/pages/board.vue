<script setup lang="ts">
import { useProjectStore } from '~/stores/project'
import type { Card, CardStatus } from '~/types/card'
import { cardStatusOrder } from '~/types/card'

type SprintFilter = 'all' | 'sprint' | 'loose'

const store = useProjectStore()
const { currentProject, currentProjectId } = storeToRefs(store)
const api = useApi()

useHead({ title: 'Board' })

const { data: activeSprint, refresh: refreshSprint } = useActiveSprint(
  () => currentProjectId.value
)

const { editing, saving, justSaved } = useSprintInlineEdit(
  activeSprint,
  (updated) => {
    activeSprint.value = updated
  }
)

// Every card the board cares about: the active sprint's cards plus all
// sprint-less cards (any status, including `backlog`). The columns and the
// backlog peek are both derived from this single list.
const cards = ref<Card[]>([])
const backlogExpanded = ref(false)
const blockedExpanded = ref(false)
const selectedTagIds = ref<string[]>([])
const sprintFilter = ref<SprintFilter>('all')

const sprintFilterOptions: { value: SprintFilter, label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'sprint', label: 'Sprint cards' },
  { value: 'loose', label: 'Loose cards' }
]

async function loadCards() {
  if (!currentProjectId.value) {
    cards.value = []
    return
  }
  const projectId = currentProjectId.value
  const [sprintList, looseList] = await Promise.all([
    activeSprint.value
      ? api<Card[]>('/cards', {
          query: { projectId, sprintId: activeSprint.value.id }
        })
      : Promise.resolve<Card[]>([]),
    api<Card[]>('/cards', { query: { projectId, backlogOnly: 'true' } })
  ])
  cards.value = [...sprintList, ...looseList]
}

useProjectData(currentProjectId, loadCards, {
  watch: [currentProjectId, activeSprint],
  onEvent: (event) => {
    if (event.type === 'card.changed' || event.type === 'card.deleted') {
      loadCards()
    } else if (
      event.type === 'sprint.changed'
      || event.type === 'sprint.deleted'
    ) {
      refreshSprint()
    } else if (event.type === 'project.changed') {
      loadCards()
    }
  }
})

// Cards shown in the status columns: everything not parked in the backlog,
// narrowed by the sprint-presence filter and then the tag filter.
const columnCards = computed(() => {
  let list = cards.value.filter(c => c.status !== 'backlog')
  if (sprintFilter.value === 'sprint') list = list.filter(c => c.sprintId)
  else if (sprintFilter.value === 'loose') list = list.filter(c => !c.sprintId)
  if (selectedTagIds.value.length) {
    const sel = new Set(selectedTagIds.value)
    list = list.filter(c => c.tags?.some(t => sel.has(t.id)))
  }
  return list
})

// The backlog peek: sprint-less cards still in the `backlog` status.
const backlogCards = computed(() =>
  cards.value.filter(c => !c.sprintId && c.status === 'backlog')
)

const columns = computed<Record<CardStatus, Card[]>>(() => {
  const grouped: Record<CardStatus, Card[]> = {
    backlog: [],
    todo: [],
    in_progress: [],
    review: [],
    done: [],
    blocked: []
  }
  for (const c of columnCards.value) grouped[c.status].push(c)
  for (const status of cardStatusOrder) {
    grouped[status].sort((a, b) => a.position - b.position || b.priority - a.priority)
  }
  return grouped
})

async function patchCard(cardId: string, body: Record<string, unknown>) {
  try {
    await api(`/cards/${cardId}`, { method: 'PATCH', body })
  } catch (err) {
    console.error('Failed to update card, reloading', err)
    await loadCards()
  }
}

// Dropped into a status column. Moves/promotes the card to that status; sprint
// membership is left untouched (a sprint-less card stays standalone).
async function onCardMoved(cardId: string, toStatus: CardStatus) {
  const card = cards.value.find(c => c.id === cardId)
  if (!card || card.status === toStatus) return
  card.status = toStatus
  await patchCard(cardId, { status: toStatus })
}

// Dropped into the backlog peek. Parks the card: `backlog` status, no sprint.
async function onMoveToBacklog(cardId: string) {
  const card = cards.value.find(c => c.id === cardId)
  if (!card) return
  card.status = 'backlog'
  card.sprintId = null
  await patchCard(cardId, { status: 'backlog', sprintId: null })
}
</script>

<template>
  <UDashboardPanel
    id="board"
    :ui="{ body: 'flex flex-col gap-4 sm:gap-6 flex-1 overflow-hidden p-4 sm:p-6' }"
  >
    <template #header>
      <UDashboardNavbar title="Board" :ui="{ left: 'flex-1 min-w-0' }">
        <template #leading>
          <UIcon name="i-lucide-kanban" class="text-primary" />
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
            {{ activeSprint.name }}
          </UBadge>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="!currentProject" class="text-center text-muted py-12">
        Pick a project in the sidebar.
      </div>
      <template v-else>
        <UTextarea
          v-if="activeSprint"
          v-model="editing.goal"
          variant="ghost"
          :rows="1"
          autoresize
          placeholder="Add a goal for the active sprint…"
          class="w-full shrink-0"
          :ui="{ base: 'text-sm text-muted !px-0 resize-none' }"
        />
        <div class="flex items-center justify-end gap-2 shrink-0">
          <USelectMenu
            v-if="activeSprint"
            :model-value="sprintFilter"
            :items="sprintFilterOptions"
            value-key="value"
            icon="i-lucide-filter"
            class="w-44"
            @update:model-value="(v: SprintFilter) => (sprintFilter = v)"
          />
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
