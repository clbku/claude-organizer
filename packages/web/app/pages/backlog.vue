<script setup lang="ts">
import { useProjectStore } from "~/stores/project";
import type { Card } from "~/types/card";
import type { Sprint } from "~/composables/useActiveSprint";
import { cardStatusMeta } from "~/types/card";

const store = useProjectStore();
const { currentProject, currentProjectId } = storeToRefs(store);
const api = useApi();

const cards = ref<Card[]>([]);
const sprints = ref<Sprint[]>([]);

async function loadCards() {
  if (!currentProjectId.value) {
    cards.value = [];
    return;
  }
  cards.value = await api<Card[]>("/cards", {
    query: { projectId: currentProjectId.value, backlogOnly: "true" },
  });
}

async function loadSprints() {
  if (!currentProjectId.value) {
    sprints.value = [];
    return;
  }
  sprints.value = await api<Sprint[]>("/sprints", {
    query: { projectId: currentProjectId.value },
  });
}

async function reload() {
  await Promise.all([loadCards(), loadSprints()]);
}

watch(currentProjectId, reload, { immediate: true });

useProjectEvents(currentProjectId, (event) => {
  if (event.type === "card.changed" || event.type === "card.deleted") {
    loadCards();
  } else if (event.type === "sprint.changed") {
    loadSprints();
  }
});

const moveTargets = computed(() =>
  sprints.value
    .filter((s) => s.status === "active" || s.status === "planned")
    .sort((a, b) => (a.status === "active" ? -1 : 1)),
);

const sortedCards = computed(() =>
  [...cards.value].sort(
    (a, b) =>
      b.priority - a.priority ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  ),
);

async function moveToSprint(cardId: string, sprintId: string) {
  await api(`/cards/${cardId}`, {
    method: "PATCH",
    body: { sprintId },
  });
  await loadCards();
}

function dropdownItems(cardId: string) {
  if (moveTargets.value.length === 0) {
    return [[{ label: "No active/planned sprints", disabled: true }]];
  }
  return [
    moveTargets.value.map((s) => ({
      label: s.name,
      icon: s.status === "active" ? "i-lucide-flame" : "i-lucide-calendar",
      onSelect: () => moveToSprint(cardId, s.id),
    })),
  ];
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
          <UBadge variant="subtle">{{ cards.length }} cards</UBadge>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="!currentProject" class="text-center text-muted py-12">
        Pick a project in the sidebar.
      </div>

      <div v-else-if="!cards.length" class="text-center text-muted py-12">
        Backlog is empty.
      </div>

      <div v-else class="space-y-2 w-full">
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
    </template>
  </UDashboardPanel>
</template>
