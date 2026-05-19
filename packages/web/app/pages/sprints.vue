<script setup lang="ts">
import { useProjectStore } from "~/stores/project";
import type { Sprint } from "~/composables/useActiveSprint";
import type { Card, CardStatus } from "~/types/card";
import { cardStatusMeta } from "~/types/card";

const store = useProjectStore();
const { currentProject, currentProjectId } = storeToRefs(store);
const api = useApi();

const sprints = ref<Sprint[]>([]);
const cards = ref<Card[]>([]);

async function loadSprints() {
  if (!currentProjectId.value) {
    sprints.value = [];
    return;
  }
  sprints.value = await api<Sprint[]>("/sprints", {
    query: { projectId: currentProjectId.value },
  });
}

async function loadCards() {
  if (!currentProjectId.value) {
    cards.value = [];
    return;
  }
  cards.value = await api<Card[]>("/cards", {
    query: { projectId: currentProjectId.value },
  });
}

async function reloadAll() {
  await Promise.all([loadSprints(), loadCards()]);
}

watch(currentProjectId, reloadAll, { immediate: true });

useProjectEvents(currentProjectId, (event) => {
  if (event.type === "sprint.changed") {
    loadSprints();
  } else if (event.type === "card.changed" || event.type === "card.deleted") {
    loadCards();
  }
});

const groupedSprints = computed(() => {
  const groups: Record<Sprint["status"], Sprint[]> = {
    active: [],
    planned: [],
    completed: [],
    cancelled: [],
  };
  for (const s of sprints.value) groups[s.status].push(s);
  return groups;
});

function statsFor(sprintId: string) {
  const list = cards.value.filter((c) => c.sprintId === sprintId);
  const counts: Record<CardStatus, number> = {
    todo: 0,
    in_progress: 0,
    review: 0,
    done: 0,
    blocked: 0,
  };
  for (const c of list) counts[c.status]++;
  return { total: list.length, counts };
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

const tabs = computed(() => [
  {
    label: `Active (${groupedSprints.value.active.length})`,
    slot: "active" as const,
    value: "active",
  },
  {
    label: `Planned (${groupedSprints.value.planned.length})`,
    slot: "planned" as const,
    value: "planned",
  },
  {
    label: `Completed (${groupedSprints.value.completed.length})`,
    slot: "completed" as const,
    value: "completed",
  },
]);
const selectedTab = ref("active");

async function startSprint(id: string) {
  await api(`/sprints/${id}/start`, { method: "POST" });
  await loadSprints();
}

async function completeSprint(id: string) {
  await api(`/sprints/${id}/complete`, { method: "POST" });
  await loadSprints();
}

const createOpen = ref(false);
const newSprint = reactive({ name: "", goal: "" });
async function createSprint() {
  if (!currentProjectId.value || !newSprint.name.trim()) return;
  await api("/sprints", {
    method: "POST",
    body: {
      projectId: currentProjectId.value,
      name: newSprint.name,
      goal: newSprint.goal || undefined,
    },
  });
  newSprint.name = "";
  newSprint.goal = "";
  createOpen.value = false;
  await loadSprints();
}
</script>

<template>
  <UDashboardPanel id="sprints">
    <template #header>
      <UDashboardNavbar title="Sprints">
        <template #leading>
          <UIcon name="i-lucide-timer" class="text-primary" />
        </template>
        <template #right>
          <UButton
            v-if="currentProject"
            icon="i-lucide-plus"
            color="primary"
            label="New sprint"
            @click="createOpen = true"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="!currentProject" class="text-center text-muted py-12">
        Pick a project in the sidebar.
      </div>

      <UTabs
        v-else
        v-model="selectedTab"
        :items="tabs"
        :ui="{ list: 'mb-4' }"
      >
        <template #active>
          <div v-if="!groupedSprints.active.length" class="text-muted text-sm py-6">
            No active sprint. Start one from the Planned tab.
          </div>
          <div v-else class="space-y-3">
            <SprintRow
              v-for="s in groupedSprints.active"
              :key="s.id"
              :sprint="s"
              :stats="statsFor(s.id)"
              :format-date="formatDate"
              @complete="completeSprint(s.id)"
            />
          </div>
        </template>

        <template #planned>
          <div v-if="!groupedSprints.planned.length" class="text-muted text-sm py-6">
            No planned sprints. Create one above.
          </div>
          <div v-else class="space-y-3">
            <SprintRow
              v-for="s in groupedSprints.planned"
              :key="s.id"
              :sprint="s"
              :stats="statsFor(s.id)"
              :format-date="formatDate"
              @start="startSprint(s.id)"
            />
          </div>
        </template>

        <template #completed>
          <div v-if="!groupedSprints.completed.length" class="text-muted text-sm py-6">
            No completed sprints yet.
          </div>
          <div v-else class="space-y-3">
            <SprintRow
              v-for="s in groupedSprints.completed"
              :key="s.id"
              :sprint="s"
              :stats="statsFor(s.id)"
              :format-date="formatDate"
            />
          </div>
        </template>
      </UTabs>
    </template>
  </UDashboardPanel>

  <UModal v-model:open="createOpen" title="Create sprint">
    <template #body>
      <div class="space-y-4">
        <UFormField label="Name" required>
          <UInput v-model="newSprint.name" placeholder="Fase 3 - Roadmaps" />
        </UFormField>
        <UFormField label="Goal" hint="Optional summary of what this sprint aims to achieve">
          <UTextarea v-model="newSprint.goal" :rows="3" />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton variant="ghost" label="Cancel" @click="createOpen = false" />
        <UButton
          color="primary"
          label="Create"
          :disabled="!newSprint.name.trim()"
          @click="createSprint"
        />
      </div>
    </template>
  </UModal>
</template>
