<script setup lang="ts">
import { useProjectStore } from "~/stores/project";
import type { Card, CardStatus } from "~/types/card";
import { cardStatusOrder } from "~/types/card";

const store = useProjectStore();
const { currentProject, currentProjectId, loading: projectsLoading } =
  storeToRefs(store);
const api = useApi();

const {
  data: activeSprint,
  pending: sprintLoading,
  refresh: refreshSprint,
} = useActiveSprint(() => currentProjectId.value);

const cards = ref<Card[]>([]);
const cardsFetched = ref(false);

async function loadCards() {
  if (!activeSprint.value || !currentProjectId.value) {
    cards.value = [];
    cardsFetched.value = true;
    return;
  }
  try {
    cards.value = await api<Card[]>("/cards", {
      query: {
        projectId: currentProjectId.value,
        sprintId: activeSprint.value.id,
      },
    });
  } finally {
    cardsFetched.value = true;
  }
}

const boardReady = computed(() => {
  if (projectsLoading.value) return false;
  if (sprintLoading.value) return false;
  if (!currentProjectId.value || !activeSprint.value) return true;
  return cardsFetched.value;
});

watch(
  [currentProjectId, activeSprint],
  async () => {
    await loadCards();
  },
  { immediate: true, deep: true },
);

useProjectEvents(currentProjectId, (event) => {
  if (event.type === "card.changed" || event.type === "card.deleted") {
    loadCards();
  } else if (event.type === "sprint.changed") {
    refreshSprint();
  }
});

const columns = computed<Record<CardStatus, Card[]>>(() => {
  const grouped: Record<CardStatus, Card[]> = {
    todo: [],
    in_progress: [],
    review: [],
    done: [],
    blocked: [],
  };
  for (const c of cards.value) grouped[c.status].push(c);
  for (const status of cardStatusOrder) {
    grouped[status].sort((a, b) => a.position - b.position || b.priority - a.priority);
  }
  return grouped;
});

async function onCardMoved(cardId: string, toStatus: CardStatus) {
  const idx = cards.value.findIndex((c) => c.id === cardId);
  if (idx === -1) return;
  const prev = cards.value[idx];
  if (!prev || prev.status === toStatus) return;
  cards.value[idx] = { ...prev, status: toStatus };
  try {
    await api(`/cards/${cardId}`, {
      method: "PATCH",
      body: { status: toStatus },
    });
  } catch (err) {
    console.error("Failed to update card status, reloading", err);
    await loadCards();
  }
}
</script>

<template>
  <UDashboardPanel
    id="board"
    :ui="{ body: 'flex flex-col flex-1 overflow-hidden p-4 sm:p-6' }"
  >
    <template #header>
      <UDashboardNavbar :title="activeSprint?.name ?? 'Board'">
        <template #leading>
          <UIcon name="i-lucide-kanban" class="text-primary" />
        </template>
        <template #right>
          <UBadge v-if="activeSprint" color="info" variant="subtle">
            active sprint
          </UBadge>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div
        v-if="!boardReady"
        class="flex gap-3 flex-1 min-h-0 min-w-0 overflow-x-auto"
      >
        <BoardColumn
          v-for="status in cardStatusOrder"
          :key="status"
          :status="status"
          :cards="[]"
          :loading="true"
        />
      </div>
      <div v-else-if="!currentProject" class="text-center text-muted py-12">
        Pick a project in the sidebar.
      </div>
      <div v-else-if="!activeSprint" class="text-center text-muted py-12">
        No active sprint for <strong>{{ currentProject.name }}</strong>.
        Start one from /sprints.
      </div>
      <div v-else class="flex gap-3 flex-1 min-h-0 min-w-0 overflow-x-auto">
        <BoardColumn
          v-for="status in cardStatusOrder"
          :key="status"
          :status="status"
          :cards="columns[status]"
          @card-moved="onCardMoved"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
