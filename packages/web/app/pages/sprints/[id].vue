<script setup lang="ts">
import type { Card, CardStatus } from "~/types/card";
import type { Sprint } from "~/composables/useActiveSprint";
import { cardStatusOrder } from "~/types/card";

const route = useRoute();
const api = useApi();
const sprintId = computed(() => String(route.params.id));

const sprint = ref<Sprint | null>(null);
const cards = ref<Card[]>([]);
const backlogCards = ref<Card[]>([]);
const error = ref<unknown>(null);

const { editing, saving, justSaved } = useSprintInlineEdit(sprint, (updated) => {
  sprint.value = updated;
});

const showBacklog = computed(
  () => sprint.value?.status === "planned" || sprint.value?.status === "active",
);

const backlogExpanded = ref(false);
watch(
  () => sprint.value?.status,
  (status) => {
    backlogExpanded.value = status === "planned";
  },
);

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
    backlogCards.value = [];
    return;
  }
  const projectId = sprint.value.projectId;
  const sprintIdLocal = sprint.value.id;
  if (showBacklog.value) {
    const [sprintList, backlogList] = await Promise.all([
      api<Card[]>("/cards", {
        query: { projectId, sprintId: sprintIdLocal },
      }),
      api<Card[]>("/cards", {
        query: { projectId, backlogOnly: "true" },
      }),
    ]);
    cards.value = sprintList;
    backlogCards.value = backlogList;
  } else {
    cards.value = await api<Card[]>("/cards", {
      query: { projectId, sprintId: sprintIdLocal },
    });
    backlogCards.value = [];
  }
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
  if (!sprint.value) return;
  const sprintIdLocal = sprint.value.id;
  // Check if card came from backlog or from another status column
  const fromBacklogIdx = backlogCards.value.findIndex((c) => c.id === cardId);
  const fromSprintIdx = cards.value.findIndex((c) => c.id === cardId);
  const body: Record<string, unknown> = { status: toStatus };
  if (fromBacklogIdx !== -1) {
    const card = backlogCards.value[fromBacklogIdx];
    if (!card) return;
    body.sprintId = sprintIdLocal;
    backlogCards.value.splice(fromBacklogIdx, 1);
    cards.value.push({ ...card, status: toStatus, sprintId: sprintIdLocal });
  } else if (fromSprintIdx !== -1) {
    const prev = cards.value[fromSprintIdx];
    if (!prev || prev.status === toStatus) return;
    cards.value[fromSprintIdx] = { ...prev, status: toStatus };
  } else {
    return;
  }
  try {
    await api(`/cards/${cardId}`, { method: "PATCH", body });
  } catch (err) {
    console.error("Failed to update card, reloading", err);
    await loadCards();
  }
}

async function onMoveToBacklog(cardId: string) {
  const idx = cards.value.findIndex((c) => c.id === cardId);
  if (idx === -1) return;
  const card = cards.value[idx];
  if (!card) return;
  cards.value.splice(idx, 1);
  backlogCards.value.push({ ...card, sprintId: null });
  try {
    await api(`/cards/${cardId}`, {
      method: "PATCH",
      body: { sprintId: null },
    });
  } catch (err) {
    console.error("Failed to move card to backlog, reloading", err);
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
    :ui="{ body: 'flex flex-col gap-4 sm:gap-6 flex-1 overflow-hidden p-4 sm:p-6' }"
  >
    <template #header>
      <UDashboardNavbar
        :title="sprint?.name ?? 'Sprint'"
        :ui="{ left: 'flex-1 min-w-0', title: 'flex-1 min-w-0' }"
      >
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            to="/sprints"
          />
        </template>
        <template v-if="sprint" #title>
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
          <template v-if="showBacklog">
            <BacklogColumn
              v-if="backlogExpanded"
              :cards="backlogCards"
              :closable="sprint.status === 'active'"
              @card-moved-to-backlog="onMoveToBacklog"
              @close="backlogExpanded = false"
            />
            <button
              v-else
              type="button"
              class="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-default hover:bg-elevated/40 hover:border-primary/40 transition shrink-0 py-3"
              style="width: 36px;"
              @click="backlogExpanded = true"
            >
              <UIcon name="i-lucide-inbox" class="size-4 text-muted" />
              <span
                class="text-xs font-semibold text-muted whitespace-nowrap"
                style="writing-mode: vertical-rl; transform: rotate(180deg);"
              >
                Backlog ({{ backlogCards.length }})
              </span>
            </button>
          </template>
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
