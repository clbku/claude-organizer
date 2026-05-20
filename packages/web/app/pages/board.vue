<script setup lang="ts">
import { useProjectStore } from "~/stores/project";
import type { Card, CardStatus } from "~/types/card";
import { cardStatusOrder } from "~/types/card";

const store = useProjectStore();
const { currentProject, currentProjectId } = storeToRefs(store);
const api = useApi();

const { data: activeSprint, refresh: refreshSprint } = useActiveSprint(
  () => currentProjectId.value,
);

const { editing, saving, justSaved } = useSprintInlineEdit(
  activeSprint,
  (updated) => {
    activeSprint.value = updated;
  },
);

const cards = ref<Card[]>([]);

async function loadCards() {
  if (!activeSprint.value || !currentProjectId.value) {
    cards.value = [];
    return;
  }
  cards.value = await api<Card[]>("/cards", {
    query: {
      projectId: currentProjectId.value,
      sprintId: activeSprint.value.id,
    },
  });
}

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
            class="w-full [&_input]:!text-lg [&_input]:!font-semibold [&_input]:!px-0"
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
