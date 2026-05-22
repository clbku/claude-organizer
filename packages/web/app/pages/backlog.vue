<script setup lang="ts">
import { useProjectStore } from '~/stores/project'
import type { Card } from '~/types/card'
import { cardStatusMeta } from '~/types/card'
import type { Sprint } from '~/types/sprint'

const store = useProjectStore()
const { currentProject, currentProjectId } = storeToRefs(store)
const api = useApi()

useHead({ title: 'Backlog' })

const cards = ref<Card[]>([])
const archivedCards = ref<Card[]>([])
const sprints = ref<Sprint[]>([])

async function loadCards() {
  if (!currentProjectId.value) {
    cards.value = []
    archivedCards.value = []
    return
  }
  [cards.value, archivedCards.value] = await Promise.all([
    // The backlog now means cards parked in the `backlog` status (sprint-less).
    api<Card[]>('/cards', {
      query: {
        projectId: currentProjectId.value,
        backlogOnly: 'true',
        status: 'backlog'
      }
    }),
    // Archived sprint-less cards keep showing here regardless of status.
    api<Card[]>('/cards', {
      query: {
        projectId: currentProjectId.value,
        backlogOnly: 'true',
        archivedOnly: 'true'
      }
    })
  ])
}

async function loadSprints() {
  if (!currentProjectId.value) {
    sprints.value = []
    return
  }
  sprints.value = await api<Sprint[]>('/sprints', {
    query: { projectId: currentProjectId.value }
  })
}

async function reload() {
  await Promise.all([loadCards(), loadSprints()])
}

useProjectData(currentProjectId, reload, {
  onEvent: (event) => {
    if (event.type === 'card.changed' || event.type === 'card.deleted') {
      loadCards()
    } else if (
      event.type === 'sprint.changed'
      || event.type === 'sprint.deleted'
    ) {
      loadSprints()
    }
  }
})

const moveTargets = computed(() =>
  sprints.value
    .filter(s => s.status === 'active' || s.status === 'planned')
    .sort(a => (a.status === 'active' ? -1 : 1))
)

const sortedCards = computed(() =>
  [...cards.value].sort(
    (a, b) =>
      b.priority - a.priority
      || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )
)

// Promote a backlog card onto the board, without a sprint: just flip its
// status to `todo`.
async function promoteToBoard(cardId: string) {
  await api(`/cards/${cardId}`, {
    method: 'PATCH',
    body: { status: 'todo' }
  })
  await loadCards()
}

// Move into a sprint. A sprint card is never `backlog`, so it lands in `todo`.
async function moveToSprint(cardId: string, sprintId: string) {
  await api(`/cards/${cardId}`, {
    method: 'PATCH',
    body: { sprintId, status: 'todo' }
  })
  await loadCards()
}

async function restoreCard(cardId: string) {
  await api(`/cards/${cardId}/restore`, { method: 'POST' })
  await loadCards()
}

function dropdownItems(cardId: string) {
  const sections: Record<string, unknown>[][] = [
    [
      {
        label: 'Send to board (To do)',
        icon: 'i-lucide-arrow-up-circle',
        onSelect: () => promoteToBoard(cardId)
      }
    ]
  ]
  if (moveTargets.value.length > 0) {
    sections.push(
      moveTargets.value.map(s => ({
        label: `Move to ${s.name}`,
        icon: s.status === 'active' ? 'i-lucide-flame' : 'i-lucide-calendar',
        onSelect: () => moveToSprint(cardId, s.id)
      }))
    )
  }
  return sections
}
</script>

<template>
  <UDashboardPanel id="backlog">
    <template #header>
      <UDashboardNavbar title="Backlog">
        <template #leading>
          <UIcon name="i-lucide-inbox" class="text-primary" />
        </template>
        <template #right>
          <UBadge variant="subtle">
            {{ cards.length }} cards
          </UBadge>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="!currentProject" class="text-center text-muted py-12">
        Pick a project in the sidebar.
      </div>

      <div v-else class="space-y-6 w-full">
        <div
          v-if="!cards.length && !archivedCards.length"
          class="text-center text-muted py-12"
        >
          Backlog is empty.
        </div>

        <div v-if="cards.length" class="space-y-2">
          <div
            v-for="card in sortedCards"
            :key="card.id"
            class="border border-default rounded-md px-3 py-2 flex items-center gap-3 hover:border-primary/40 transition"
          >
            <UBadge
              :color="cardStatusMeta[card.status].color"
              variant="subtle"
              size="xs"
              class="shrink-0"
            >
              {{ cardStatusMeta[card.status].label }}
            </UBadge>
            <UBadge
              v-if="card.priority > 0"
              size="xs"
              variant="soft"
              class="shrink-0"
            >
              P{{ card.priority }}
            </UBadge>

            <NuxtLink
              :to="`/cards/${card.key}`"
              class="flex-1 min-w-0 hover:underline decoration-primary/40 underline-offset-2"
            >
              <div class="flex items-baseline gap-2 min-w-0">
                <span class="font-mono font-bold text-default text-sm shrink-0">
                  {{ card.key }}
                </span>
                <span class="font-medium text-sm truncate">
                  {{ card.title }}
                </span>
              </div>
              <p
                v-if="card.summary"
                class="text-xs text-muted truncate mt-0.5"
              >
                {{ card.summary }}
              </p>
            </NuxtLink>

            <UDropdownMenu :items="dropdownItems(card.id)" :popper="{ placement: 'bottom-end' }">
              <UButton
                icon="i-lucide-arrow-right-circle"
                size="sm"
                color="neutral"
                variant="ghost"
                trailing-icon="i-lucide-chevron-down"
                label="Move"
              />
            </UDropdownMenu>
          </div>
        </div>

        <ArchivedDisclosure :count="archivedCards.length" label="Archived">
          <div class="space-y-2">
            <div
              v-for="card in archivedCards"
              :key="card.id"
              class="border border-dashed border-default rounded-md px-3 py-2 flex items-center gap-3"
            >
              <UBadge
                :color="cardStatusMeta[card.status].color"
                variant="subtle"
                size="xs"
                class="shrink-0"
              >
                {{ cardStatusMeta[card.status].label }}
              </UBadge>
              <NuxtLink
                :to="`/cards/${card.key}`"
                class="flex-1 min-w-0 hover:underline decoration-primary/40 underline-offset-2"
              >
                <span class="font-mono font-bold text-default text-sm mr-1.5">{{ card.key }}</span>
                <span class="font-medium text-sm text-muted">{{ card.title }}</span>
              </NuxtLink>
              <UButton
                icon="i-lucide-archive-restore"
                size="xs"
                color="neutral"
                variant="soft"
                label="Restore"
                class="shrink-0"
                @click="restoreCard(card.id)"
              />
            </div>
          </div>
        </ArchivedDisclosure>
      </div>
    </template>
  </UDashboardPanel>
</template>
