<script setup lang="ts">
import type { Card, CardStatus } from "~/types/card";
import type { Sprint } from "~/composables/useActiveSprint";
import { cardStatusOrder } from "~/types/card";

const route = useRoute();
const api = useApi();
const sprintId = computed(() => String(route.params.id));

const sprint = ref<Sprint | null>(null);
const cards = ref<Card[]>([]);
const error = ref<unknown>(null);

async function loadSprint() {
  try {
    sprint.value = await api<Sprint>(`/sprints/${sprintId.value}`);
  } catch (err) {
    error.value = err;
    sprint.value = null;
  }
}

async function loadCards() {
  if (!sprint.value) {
    cards.value = [];
    return;
  }
  cards.value = await api<Card[]>("/cards", {
    query: {
      projectId: sprint.value.projectId,
      sprintId: sprint.value.id,
    },
  });
}

watch(
  sprintId,
  async () => {
    await loadSprint();
    await loadCards();
  },
  { immediate: true },
);

useProjectEvents(
  () => sprint.value?.projectId ?? null,
  (event) => {
    if (event.type === "card.changed" || event.type === "card.deleted") {
      loadCards();
    } else if (
      event.type === "sprint.changed" &&
      event.sprintId === sprintId.value
    ) {
      loadSprint();
    }
  },
);

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
    grouped[status].sort(
      (a, b) => a.position - b.position || b.priority - a.priority,
    );
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

const statusBadgeColor = computed(() => {
  if (!sprint.value) return "neutral";
  return (
    {
      planned: "neutral",
      active: "info",
      completed: "success",
      cancelled: "error",
    } as const
  )[sprint.value.status];
});

async function startSprint() {
  if (!sprint.value) return;
  await api(`/sprints/${sprint.value.id}/start`, { method: "POST" });
  await loadSprint();
}

async function completeSprint() {
  if (!sprint.value) return;
  await api(`/sprints/${sprint.value.id}/complete`, { method: "POST" });
  await loadSprint();
}
</script>

<template>
  <UDashboardPanel
    id="sprint-detail"
    :ui="{ body: 'flex flex-col flex-1 overflow-hidden p-4 sm:p-6' }"
  >
    <template #header>
      <UDashboardNavbar :title="sprint?.name ?? 'Sprint'">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            to="/sprints"
          />
        </template>
        <template #right>
          <UBadge v-if="sprint" :color="statusBadgeColor" variant="subtle">
            {{ sprint.status }}
          </UBadge>
          <UButton
            v-if="sprint?.status === 'planned'"
            icon="i-lucide-play"
            size="sm"
            color="primary"
            variant="soft"
            label="Start"
            class="ml-2"
            @click="startSprint"
          />
          <UButton
            v-if="sprint?.status === 'active'"
            icon="i-lucide-check"
            size="sm"
            color="success"
            variant="soft"
            label="Complete"
            class="ml-2"
            @click="completeSprint"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="error" class="text-error py-12 text-center">
        Sprint not found.
      </div>
      <template v-else-if="sprint">
        <p v-if="sprint.goal" class="text-sm text-muted mb-4 shrink-0">
          {{ sprint.goal }}
        </p>
        <div class="flex gap-3 flex-1 min-h-0 min-w-0 overflow-x-auto">
          <BoardColumn
            v-for="status in cardStatusOrder"
            :key="status"
            :status="status"
            :cards="columns[status]"
            @card-moved="onCardMoved"
          />
        </div>
      </template>
    </template>
  </UDashboardPanel>
</template>
