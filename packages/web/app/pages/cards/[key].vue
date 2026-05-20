<script setup lang="ts">
import type { Card, CardStatus } from "~/types/card";
import type { Comment } from "~/types/comment";
import type { Sprint } from "~/composables/useActiveSprint";
import type { Tag } from "~/types/tag";
import type { EditorToolbarItem } from "@nuxt/ui";
import { cardStatusMeta, cardStatusOrder } from "~/types/card";

const descriptionToolbarItems: EditorToolbarItem[] = [
  { kind: "mark", mark: "bold", icon: "i-lucide-bold" },
  { kind: "mark", mark: "italic", icon: "i-lucide-italic" },
  { kind: "mark", mark: "strike", icon: "i-lucide-strikethrough" },
  { kind: "mark", mark: "code", icon: "i-lucide-code" },
  { kind: "heading", level: 2, icon: "i-lucide-heading-2" },
  { kind: "heading", level: 3, icon: "i-lucide-heading-3" },
  { kind: "bulletList", icon: "i-lucide-list" },
  { kind: "orderedList", icon: "i-lucide-list-ordered" },
  { kind: "blockquote", icon: "i-lucide-quote" },
  { kind: "codeBlock", icon: "i-lucide-code-2" },
  { kind: "link", icon: "i-lucide-link" },
  { kind: "horizontalRule", icon: "i-lucide-minus" },
  { kind: "undo", icon: "i-lucide-undo" },
  { kind: "redo", icon: "i-lucide-redo" },
];

const route = useRoute();
const router = useRouter();
const api = useApi();
const cardKey = computed(() => String(route.params.key));

function goBack() {
  if (import.meta.client && window.history.length > 1) {
    router.back();
  } else {
    router.push("/board");
  }
}

const card = ref<Card | null>(null);
const comments = ref<Comment[]>([]);
const sprints = ref<Sprint[]>([]);
const cardLoading = ref(true);
const cardError = ref<unknown>(null);

const editing = reactive({
  title: "",
  summary: "",
  descriptionMd: "",
});

async function fetchCard(): Promise<Card | null> {
  try {
    return await api<Card>(`/cards/by-key/${cardKey.value}`);
  } catch (err) {
    cardError.value = err;
    return null;
  }
}

async function fetchComments(cardId: string) {
  return api<Comment[]>(`/cards/${cardId}/comments`, {
    query: { markAsRead: "false" },
  });
}

async function fetchSprints(projectId: string) {
  return api<Sprint[]>("/sprints", { query: { projectId } });
}

// Initial load: full state replacement, syncs editing fields, toggles loading.
async function loadCard() {
  cardLoading.value = true;
  cardError.value = null;
  const fresh = await fetchCard();
  card.value = fresh;
  if (fresh) {
    editing.title = fresh.title;
    editing.summary = fresh.summary ?? "";
    editing.descriptionMd = fresh.descriptionMd ?? "";
    [comments.value, sprints.value] = await Promise.all([
      fetchComments(fresh.id),
      fetchSprints(fresh.projectId),
    ]);
  }
  cardLoading.value = false;
}

// Silent refresh: no loading flag, smart-syncs editing fields only when the
// user hasn't diverged locally (avoids overwriting mid-edit).
async function refreshCard() {
  const fresh = await fetchCard();
  if (!fresh) return;
  const previous = card.value;
  card.value = fresh;
  if (previous && previous.id === fresh.id) {
    if (editing.title === previous.title && fresh.title !== editing.title) {
      editing.title = fresh.title;
    }
    if (
      editing.summary === (previous.summary ?? "") &&
      (fresh.summary ?? "") !== editing.summary
    ) {
      editing.summary = fresh.summary ?? "";
    }
    if (
      editing.descriptionMd === (previous.descriptionMd ?? "") &&
      (fresh.descriptionMd ?? "") !== editing.descriptionMd
    ) {
      editing.descriptionMd = fresh.descriptionMd ?? "";
    }
  }
}

async function refreshComments() {
  if (!card.value) return;
  comments.value = await fetchComments(card.value.id);
}

watch(
  cardKey,
  () => {
    loadCard();
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
    } else if (event.type === "project.changed") {
      refreshCard();
    }
  },
);

const saving = ref(false);
const justSaved = ref(false);
let savedTimer: ReturnType<typeof setTimeout> | null = null;
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
    justSaved.value = true;
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(() => {
      justSaved.value = false;
    }, 1500);
  } finally {
    saving.value = false;
  }
}

function buildDirtyPatch(): Record<string, unknown> | null {
  if (!card.value) return null;
  const body: Record<string, unknown> = {};
  const trimmedTitle = editing.title.trim();
  if (trimmedTitle && trimmedTitle !== card.value.title) {
    body.title = trimmedTitle;
  }
  if (editing.summary !== (card.value.summary ?? "")) {
    body.summary = editing.summary.trim() ? editing.summary : null;
  }
  if (editing.descriptionMd !== (card.value.descriptionMd ?? "")) {
    body.descriptionMd = editing.descriptionMd;
  }
  return Object.keys(body).length > 0 ? body : null;
}

function scheduleSave() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const body = buildDirtyPatch();
    if (body) patch(body);
  }, 800);
}

watch(
  () => [editing.title, editing.summary, editing.descriptionMd],
  scheduleSave,
);

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

function onTagsChange(tags: Tag[]) {
  if (card.value) card.value = { ...card.value, tags };
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
            @click="goBack"
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
            v-else-if="justSaved"
            class="text-xs text-muted ml-2 flex items-center gap-1 transition-opacity"
          >
            <UIcon name="i-lucide-check" /> Saved
          </span>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="cardLoading" class="text-muted py-12 text-center">Loading…</div>
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
            <div class="border border-default rounded-md overflow-hidden">
              <UEditor
                v-slot="{ editor }"
                v-model="editing.descriptionMd"
                content-type="markdown"
                placeholder="Write a description… (markdown supported)"
                class="min-h-[200px]"
                :ui="{ base: 'px-3 py-2 [&_*]:my-2 [&_*:first-child]:!mt-0 [&_*:last-child]:!mb-0' }"
              >
                <UEditorToolbar
                  :editor="editor"
                  :items="descriptionToolbarItems"
                  class="border-b border-default bg-elevated/30"
                />
              </UEditor>
            </div>
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

            <div>
              <label class="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
                Tags
              </label>
              <TagSelector
                :card-id="card.id"
                :project-id="card.projectId"
                :model-value="card.tags ?? []"
                @update:model-value="onTagsChange"
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
