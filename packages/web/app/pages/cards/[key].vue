<script setup lang="ts">
import type { Card, CardStatus } from "~/types/card";
import type { Comment } from "~/types/comment";
import type { Sprint } from "~/composables/useActiveSprint";
import { cardStatusMeta, cardStatusOrder } from "~/types/card";

const route = useRoute();
const api = useApi();
const cardKey = computed(() => String(route.params.key));

const {
  data: card,
  pending: cardPending,
  error: cardError,
  refresh: refreshCard,
} = await useAsyncData<Card | null>(
  () => `card:${cardKey.value}`,
  async () => {
    try {
      return await api<Card>(`/cards/by-key/${cardKey.value}`);
    } catch {
      return null;
    }
  },
  { watch: [cardKey] },
);

const { data: comments, refresh: refreshComments } = await useAsyncData<Comment[]>(
  () => `comments:${card.value?.id ?? "none"}`,
  async () => {
    if (!card.value) return [];
    return api<Comment[]>(`/cards/${card.value.id}/comments`, {
      query: { markAsRead: "false" },
    });
  },
  { watch: [() => card.value?.id] },
);

const { data: sprints } = await useAsyncData<Sprint[]>(
  () => `sprints:${card.value?.projectId ?? "none"}`,
  async () => {
    if (!card.value?.projectId) return [];
    return api<Sprint[]>("/sprints", {
      query: { projectId: card.value.projectId },
    });
  },
  { watch: [() => card.value?.projectId] },
);

const editing = reactive({
  title: "",
  summary: "",
  descriptionMd: "",
});

watch(
  () => card.value,
  (c) => {
    if (c) {
      editing.title = c.title;
      editing.summary = c.summary ?? "";
      editing.descriptionMd = c.descriptionMd ?? "";
    }
  },
  { immediate: true },
);

useProjectEvents(
  () => card.value?.projectId ?? null,
  (event) => {
    if (!card.value) return;
    if (
      (event.type === "card.changed" || event.type === "card.deleted") &&
      event.cardId === card.value.id
    ) {
      refreshCard();
    } else if (
      event.type === "comment.added" &&
      event.cardId === card.value.id
    ) {
      refreshComments();
    }
  },
);

const saving = ref(false);
const justSavedAt = ref<number | null>(null);
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

async function patch(body: Record<string, unknown>) {
  if (!card.value) return;
  saving.value = true;
  try {
    const updated = await api<Card>(`/cards/${card.value.id}`, {
      method: "PATCH",
      body,
    });
    card.value = updated;
    justSavedAt.value = Date.now();
  } finally {
    saving.value = false;
  }
}

function scheduleTextSave() {
  if (!card.value) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (!card.value) return;
    const body: Record<string, unknown> = {};
    if (editing.title !== card.value.title) body.title = editing.title;
    if (editing.summary !== (card.value.summary ?? "")) {
      body.summary = editing.summary.trim() ? editing.summary : null;
    }
    if (editing.descriptionMd !== (card.value.descriptionMd ?? "")) {
      body.descriptionMd = editing.descriptionMd;
    }
    if (Object.keys(body).length > 0) patch(body);
  }, 800);
}

watch(() => [editing.title, editing.summary, editing.descriptionMd], scheduleTextSave);

const dueDateInput = computed({
  get: () => (card.value?.dueDate ? card.value.dueDate.slice(0, 10) : ""),
  set: (val) => {
    patch({ dueDate: val ? new Date(val).toISOString() : null });
  },
});

const statusOptions = cardStatusOrder.map((s) => ({
  label: cardStatusMeta[s].label,
  value: s,
  color: cardStatusMeta[s].color,
}));

const priorityOptions = Array.from({ length: 11 }, (_, i) => ({
  label: i === 0 ? "0 (none)" : `P${i}`,
  value: i,
}));

const sprintOptions = computed(() => {
  const list = sprints.value ?? [];
  return [
    { label: "Backlog", value: null as string | null },
    ...list.map((s) => ({
      label: `${s.name}${s.status === "active" ? " (active)" : ""}`,
      value: s.id as string | null,
    })),
  ];
});

const newComment = ref("");
const submittingComment = ref(false);

async function submitComment() {
  if (!card.value || !newComment.value.trim()) return;
  submittingComment.value = true;
  try {
    await api(`/cards/${card.value.id}/comments`, {
      method: "POST",
      body: { author: "user", bodyMd: newComment.value },
    });
    newComment.value = "";
    await refreshComments();
  } finally {
    submittingComment.value = false;
  }
}

const meta = computed(() =>
  card.value ? cardStatusMeta[card.value.status] : null,
);

function authorLabel(author: "ai" | "user") {
  return author === "ai" ? "Claude" : "You";
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}
</script>

<template>
  <UDashboardPanel id="card-detail">
    <template #header>
      <UDashboardNavbar :title="card?.key ?? cardKey">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            to="/board"
          />
        </template>
        <template #right>
          <UBadge v-if="meta" :color="meta.color" variant="subtle">
            {{ meta.label }}
          </UBadge>
          <span
            v-if="saving"
            class="text-xs text-muted ml-2 flex items-center gap-1"
          >
            <UIcon name="i-lucide-loader-2" class="animate-spin" /> Saving…
          </span>
          <span
            v-else-if="justSavedAt"
            class="text-xs text-muted ml-2 flex items-center gap-1"
          >
            <UIcon name="i-lucide-check" /> Saved
          </span>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="cardPending" class="text-muted py-12 text-center">Loading…</div>
      <div v-else-if="cardError" class="text-error py-12 text-center">
        Error loading card.
      </div>
      <div v-else-if="!card" class="text-muted py-12 text-center">
        Card <strong>{{ cardKey }}</strong> not found.
      </div>

      <div
        v-else
        class="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 max-w-6xl mx-auto w-full"
      >
        <main class="space-y-6 min-w-0">
          <section>
            <div class="flex items-baseline gap-2">
              <span class="font-mono font-bold text-default text-lg">
                {{ card.key }}
              </span>
              <UInput
                v-model="editing.title"
                variant="ghost"
                size="lg"
                class="flex-1 [&_input]:!text-lg [&_input]:!font-semibold"
              />
            </div>
          </section>

          <section>
            <label class="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
              Summary
            </label>
            <UTextarea
              v-model="editing.summary"
              :rows="2"
              placeholder="One-sentence summary that appears in the board preview"
              class="w-full"
            />
          </section>

          <section>
            <label class="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
              Description
            </label>
            <UTextarea
              v-model="editing.descriptionMd"
              :rows="10"
              placeholder="Full markdown description…"
              class="w-full font-mono text-sm"
            />
            <details
              v-if="editing.descriptionMd"
              class="mt-2"
            >
              <summary class="text-xs text-muted cursor-pointer select-none">
                Preview
              </summary>
              <AppMarkdown
                :value="editing.descriptionMd"
                class="mt-2 p-3 border border-default rounded-md text-sm leading-relaxed [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_code]:bg-elevated [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3"
              />
            </details>
          </section>

          <section>
            <h2 class="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
              Comments
              <span class="text-default ml-1">({{ comments?.length ?? 0 }})</span>
            </h2>

            <div v-if="!comments?.length" class="text-sm text-muted/60 italic py-4">
              No comments yet.
            </div>

            <ul v-else class="space-y-3">
              <li
                v-for="c in comments"
                :key="c.id"
                class="border border-default rounded-md p-3"
                :class="
                  c.author === 'user' && !c.readByAi
                    ? 'ring-1 ring-warning/60'
                    : ''
                "
              >
                <div class="flex items-center justify-between gap-2 mb-1.5">
                  <div class="flex items-center gap-2">
                    <UAvatar
                      :icon="c.author === 'ai' ? 'i-lucide-bot' : 'i-lucide-user'"
                      size="xs"
                      :ui="
                        c.author === 'ai'
                          ? { root: 'bg-primary/15 text-primary' }
                          : { root: 'bg-warning/15 text-warning' }
                      "
                    />
                    <span class="text-sm font-medium">{{ authorLabel(c.author) }}</span>
                    <UBadge
                      v-if="c.author === 'user' && !c.readByAi"
                      size="xs"
                      color="warning"
                      variant="subtle"
                    >
                      unread by AI
                    </UBadge>
                  </div>
                  <span class="text-xs text-muted/70">{{ formatDate(c.createdAt) }}</span>
                </div>
                <AppMarkdown
                  :value="c.bodyMd"
                  class="text-sm leading-relaxed [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_strong]:font-semibold [&_code]:bg-elevated [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono"
                />
              </li>
            </ul>

            <form class="mt-4 space-y-2" @submit.prevent="submitComment">
              <UTextarea
                v-model="newComment"
                :rows="3"
                placeholder="Write a comment for Claude… (markdown supported)"
                :disabled="submittingComment"
                class="w-full"
              />
              <div class="flex justify-end">
                <UButton
                  type="submit"
                  color="primary"
                  :loading="submittingComment"
                  :disabled="!newComment.trim()"
                  icon="i-lucide-send"
                  label="Send"
                />
              </div>
            </form>
          </section>
        </main>

        <aside class="space-y-4">
          <div class="border border-default rounded-md p-3 space-y-3">
            <div>
              <label class="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
                Status
              </label>
              <USelectMenu
                :model-value="card.status"
                :items="statusOptions"
                value-key="value"
                class="w-full"
                @update:model-value="(v: CardStatus) => patch({ status: v })"
              />
            </div>

            <div>
              <label class="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
                Priority
              </label>
              <USelectMenu
                :model-value="card.priority"
                :items="priorityOptions"
                value-key="value"
                class="w-full"
                @update:model-value="(v: number) => patch({ priority: v })"
              />
            </div>

            <div>
              <label class="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
                Sprint
              </label>
              <USelectMenu
                :model-value="card.sprintId"
                :items="sprintOptions"
                value-key="value"
                class="w-full"
                @update:model-value="(v: string | null) => patch({ sprintId: v })"
              />
            </div>

            <div>
              <label class="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
                Due date
              </label>
              <UInput
                v-model="dueDateInput"
                type="date"
                class="w-full"
              />
            </div>
          </div>

          <div class="border border-default rounded-md p-3 text-xs text-muted space-y-1">
            <div>
              <span class="font-semibold">Created</span>: {{ formatDate(card.createdAt) }}
            </div>
            <div>
              <span class="font-semibold">Updated</span>: {{ formatDate(card.updatedAt) }}
            </div>
            <div class="font-mono break-all">
              <span class="font-semibold font-sans">ID</span>: {{ card.id }}
            </div>
          </div>
        </aside>
      </div>
    </template>
  </UDashboardPanel>
</template>
