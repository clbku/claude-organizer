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

// Shared typography so the rendered markdown (view) matches the editor on toggle.
const PROSE =
  "text-sm leading-relaxed [&_h1]:!text-base [&_h1]:font-bold [&_h1]:!mt-3 [&_h1]:!mb-1 [&_h2]:!text-sm [&_h2]:font-bold [&_h2]:!mt-3 [&_h2]:!mb-1 [&_h3]:!text-sm [&_h3]:font-semibold [&_h3]:!mt-2 [&_h3]:!mb-1 [&_p]:!my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:!my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:!my-1.5 [&_li]:!my-0.5 [&_a]:text-primary [&_a]:font-medium hover:[&_a]:underline [&_strong]:font-semibold [&_code]:bg-elevated [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono [&_pre]:bg-elevated [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_blockquote]:border-l-2 [&_blockquote]:border-default [&_blockquote]:pl-3 [&_blockquote]:text-muted";

const route = useRoute();
const router = useRouter();
const api = useApi();
const cardKey = computed(() => String(route.params.key));

function goBack() {
  const sprintId = card.value?.sprintId;
  if (!sprintId) {
    router.push("/backlog");
    return;
  }
  const active = sprints.value.find((s) => s.status === "active");
  router.push(
    active && active.id === sprintId ? "/board" : `/sprints/${sprintId}`,
  );
}

const card = ref<Card | null>(null);
const comments = ref<Comment[]>([]);
const sprints = ref<Sprint[]>([]);
const allCards = ref<Card[]>([]);
const descriptionEditing = ref(false);
const descriptionEl = ref<HTMLElement | null>(null);
const titleEditing = ref(false);
const summaryEditing = ref(false);
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

async function fetchProjectCards(projectId: string) {
  return api<Card[]>("/cards", { query: { projectId } });
}

// Initial load: full state replacement, syncs editing fields, toggles loading.
async function loadCard() {
  cardLoading.value = true;
  cardError.value = null;
  descriptionEditing.value = false;
  titleEditing.value = false;
  summaryEditing.value = false;
  const fresh = await fetchCard();
  card.value = fresh;
  if (fresh) {
    editing.title = fresh.title;
    editing.summary = fresh.summary ?? "";
    editing.descriptionMd = fresh.descriptionMd ?? "";
    [comments.value, sprints.value, allCards.value] = await Promise.all([
      fetchComments(fresh.id),
      fetchSprints(fresh.projectId),
      fetchProjectCards(fresh.projectId),
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
      (event.type === "comment.added" || event.type === "comment.deleted") &&
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
    card.value = { ...card.value, ...updated };
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
  const currentId = card.value?.sprintId ?? null;
  // Only active/planned sprints are assignable. Keep the card's current sprint
  // even if completed/cancelled, so the selector still shows its actual value
  // (without offering finalized sprints as options for other cards).
  const selectable = list.filter(
    (s) =>
      s.status === "active" || s.status === "planned" || s.id === currentId,
  );
  return [
    { label: "Backlog", value: null as string | null },
    ...selectable.map((s) => ({
      label: `${s.name}${s.status === "active" ? " (active)" : ""}`,
      value: s.id as string | null,
    })),
  ];
});

// História (parent): top-level cards, excluding this one.
const storyOptions = computed(() => {
  const list = allCards.value.filter(
    (c) => !c.parentId && c.id !== card.value?.id,
  );
  return [
    { label: "Nenhuma", value: null as string | null },
    ...list.map((c) => ({
      label: `${c.key} · ${c.title}`,
      value: c.id as string | null,
    })),
  ];
});

// Candidatos a virar sub-task: cards livres (sem pai e sem filhos), != atual.
const subtaskCandidateOptions = computed(() =>
  allCards.value
    .filter((c) => c.id !== card.value?.id && !c.parentId && !c.subtaskCount)
    .map((c) => ({ value: c.id, label: `${c.key} · ${c.title}` })),
);

async function refreshProjectCards() {
  if (card.value) {
    allCards.value = await fetchProjectCards(card.value.projectId);
  }
}

// Bumped after each add to remount the select, resetting its internal state
// (otherwise it keeps showing the picked id after the card leaves the list).
const subtaskSelectKey = ref(0);
function onAddSubtask(v: string | undefined) {
  subtaskSelectKey.value++;
  if (v) addSubtask(v);
}

async function addSubtask(childId: string) {
  if (!card.value) return;
  await api(`/cards/${childId}`, {
    method: "PATCH",
    body: { parentId: card.value.id },
  });
  await Promise.all([refreshCard(), refreshProjectCards()]);
}

async function detachSubtask(childId: string) {
  await api(`/cards/${childId}`, { method: "PATCH", body: { parentId: null } });
  await Promise.all([refreshCard(), refreshProjectCards()]);
}

const blockerSelectKey = ref(0);
function onAddBlocker(v: string | undefined) {
  blockerSelectKey.value++;
  if (v) addBlocker(v);
}

async function addBlocker(blockerId: string) {
  if (!card.value) return;
  await api(`/cards/${card.value.id}/blockers/${blockerId}`, {
    method: "POST",
  });
  await refreshCard();
}

async function removeBlocker(blockerId: string) {
  if (!card.value) return;
  await api(`/cards/${card.value.id}/blockers/${blockerId}`, {
    method: "DELETE",
  });
  await refreshCard();
}

const blockerCandidateOptions = computed(() => {
  const blockedIds = new Set((card.value?.blockedBy ?? []).map((c) => c.id));
  return allCards.value
    .filter((c) => c.id !== card.value?.id && !blockedIds.has(c.id))
    .map((c) => ({ value: c.id, label: `${c.key} · ${c.title}` }));
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

const commentToDelete = ref<Comment | null>(null);
const deletingComment = ref(false);
const deleteCommentOpen = computed({
  get: () => commentToDelete.value !== null,
  set: (open) => {
    if (!open) commentToDelete.value = null;
  },
});

async function confirmDeleteComment() {
  if (!commentToDelete.value) return;
  deletingComment.value = true;
  try {
    await api(`/comments/${commentToDelete.value.id}`, { method: "DELETE" });
    await refreshComments();
    commentToDelete.value = null;
  } finally {
    deletingComment.value = false;
  }
}

function onTagsChange(tags: Tag[]) {
  if (card.value) card.value = { ...card.value, tags };
}

// Description toggles between rendered markdown (with card links) and the
// editor. Click to edit; click outside the box (toolbar included) to render.
function enterDescriptionEdit(e: MouseEvent) {
  if ((e.target as HTMLElement).closest("a")) return; // let card links navigate
  descriptionEditing.value = true;
}

function enterTitleEdit(e: MouseEvent) {
  if ((e.target as HTMLElement).closest("a")) return;
  titleEditing.value = true;
}

function enterSummaryEdit(e: MouseEvent) {
  if ((e.target as HTMLElement).closest("a")) return;
  summaryEditing.value = true;
}

function onDescriptionOutside(e: MouseEvent) {
  if (descriptionEl.value && !descriptionEl.value.contains(e.target as Node)) {
    descriptionEditing.value = false;
  }
}

watch(descriptionEditing, (active) => {
  if (active) document.addEventListener("mousedown", onDescriptionOutside);
  else document.removeEventListener("mousedown", onDescriptionOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onDescriptionOutside);
});

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
        <template v-if="card" #title>
          <div class="flex items-center gap-1.5 min-w-0 font-mono">
            <NuxtLink
              v-if="card.parent"
              :to="`/cards/${card.parent.key}`"
              class="shrink-0 text-muted hover:text-default transition"
              :title="card.parent.title"
            >
              {{ card.parent.key }}
            </NuxtLink>
            <span v-if="card.parent" class="shrink-0 text-muted">/</span>
            <span class="truncate font-bold">{{ card.key }}</span>
          </div>
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
                v-if="titleEditing"
                v-model="editing.title"
                variant="ghost"
                size="lg"
                autofocus
                class="flex-1 [&_input]:!text-lg [&_input]:!font-semibold"
                @blur="titleEditing = false"
              />
              <h1
                v-else
                class="flex-1 cursor-text text-lg font-semibold"
                @click="enterTitleEdit"
              >
                <InlineCardText :value="editing.title" />
              </h1>
            </div>
          </section>

          <section>
            <label class="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
              Summary
            </label>
            <UTextarea
              v-if="summaryEditing"
              v-model="editing.summary"
              :rows="2"
              autofocus
              placeholder="One-sentence summary that appears in the board preview"
              class="w-full"
              @blur="summaryEditing = false"
            />
            <div
              v-else
              class="min-h-[2.5rem] cursor-text rounded-md border border-default px-3 py-2"
              @click="enterSummaryEdit"
            >
              <InlineCardText
                v-if="editing.summary"
                :value="editing.summary"
                class="text-sm"
              />
              <span v-else class="text-sm italic text-muted/50">
                Sem resumo. Clique para editar.
              </span>
            </div>
          </section>

          <section>
            <label class="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
              Description
            </label>
            <div
              ref="descriptionEl"
              class="border border-default rounded-md overflow-hidden"
            >
              <UEditor
                v-if="descriptionEditing"
                v-slot="{ editor }"
                v-model="editing.descriptionMd"
                content-type="markdown"
                autofocus="end"
                placeholder="Write a description… (markdown supported)"
                class="min-h-[200px]"
                :ui="{ base: `px-3 py-2 [&_*:first-child]:!mt-0 [&_*:last-child]:!mb-0 ${PROSE}` }"
              >
                <UEditorToolbar
                  :editor="editor"
                  :items="descriptionToolbarItems"
                  class="border-b border-default bg-elevated/30"
                />
              </UEditor>
              <div
                v-else
                class="px-3 py-2 min-h-[80px] cursor-text"
                @click="enterDescriptionEdit"
              >
                <AppMarkdown
                  v-if="editing.descriptionMd"
                  :value="editing.descriptionMd"
                  :class="PROSE"
                />
                <span v-else class="text-sm text-muted/50 italic">
                  Sem descrição. Clique para editar.
                </span>
              </div>
            </div>
          </section>

          <section v-if="!card.parentId">
            <h2 class="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
              Sub-tasks
              <span v-if="card.subtasks?.length" class="text-default ml-1">
                ({{ card.subtasks.filter((s) => s.status === "done").length }}/{{
                  card.subtasks.length
                }})
              </span>
            </h2>
            <ul v-if="card.subtasks?.length" class="space-y-1.5 mb-3">
              <li
                v-for="s in card.subtasks"
                :key="s.id"
                class="flex items-center gap-2 border border-default rounded-md px-2.5 py-1.5"
              >
                <UBadge
                  :color="cardStatusMeta[s.status].color"
                  variant="subtle"
                  size="xs"
                  class="shrink-0"
                >
                  {{ cardStatusMeta[s.status].label }}
                </UBadge>
                <NuxtLink
                  :to="`/cards/${s.key}`"
                  class="min-w-0 flex-1 truncate text-sm hover:underline"
                >
                  <span class="font-mono font-bold mr-1.5">{{ s.key }}</span>{{ s.title }}
                </NuxtLink>
                <UButton
                  icon="i-lucide-x"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  class="shrink-0"
                  aria-label="Detach sub-task"
                  @click="detachSubtask(s.id)"
                />
              </li>
            </ul>
            <USelectMenu
              :key="subtaskSelectKey"
              :items="subtaskCandidateOptions"
              :model-value="undefined"
              value-key="value"
              label-key="label"
              placeholder="+ Adicionar card como sub-task"
              :search-input="{ placeholder: 'Buscar card…' }"
              icon="i-lucide-plus"
              class="w-full"
              @update:model-value="onAddSubtask"
            />
          </section>

          <section>
            <h2 class="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
              Bloqueado por
              <span v-if="card.blockedBy?.length" class="text-default ml-1">
                ({{ card.blockedBy.length }})
              </span>
            </h2>
            <ul v-if="card.blockedBy?.length" class="space-y-1.5 mb-3">
              <li
                v-for="b in card.blockedBy"
                :key="b.id"
                class="flex items-center gap-2 border border-default rounded-md px-2.5 py-1.5"
              >
                <UBadge
                  :color="cardStatusMeta[b.status].color"
                  variant="subtle"
                  size="xs"
                  class="shrink-0"
                >
                  {{ cardStatusMeta[b.status].label }}
                </UBadge>
                <NuxtLink
                  :to="`/cards/${b.key}`"
                  class="min-w-0 flex-1 truncate text-sm hover:underline"
                >
                  <span class="font-mono font-bold mr-1.5">{{ b.key }}</span>{{ b.title }}
                </NuxtLink>
                <UButton
                  icon="i-lucide-x"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  class="shrink-0"
                  aria-label="Remover bloqueador"
                  @click="removeBlocker(b.id)"
                />
              </li>
            </ul>
            <USelectMenu
              :key="blockerSelectKey"
              :items="blockerCandidateOptions"
              :model-value="undefined"
              value-key="value"
              label-key="label"
              placeholder="+ Marcar como bloqueado por…"
              :search-input="{ placeholder: 'Buscar card…' }"
              icon="i-lucide-ban"
              class="w-full"
              @update:model-value="onAddBlocker"
            />
          </section>

          <section v-if="card.blocking?.length">
            <h2 class="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
              Bloqueando
              <span class="text-default ml-1">({{ card.blocking.length }})</span>
            </h2>
            <ul class="space-y-1.5">
              <li
                v-for="b in card.blocking"
                :key="b.id"
                class="flex items-center gap-2 border border-default rounded-md px-2.5 py-1.5"
              >
                <UBadge
                  :color="cardStatusMeta[b.status].color"
                  variant="subtle"
                  size="xs"
                  class="shrink-0"
                >
                  {{ cardStatusMeta[b.status].label }}
                </UBadge>
                <NuxtLink
                  :to="`/cards/${b.key}`"
                  class="min-w-0 flex-1 truncate text-sm hover:underline"
                >
                  <span class="font-mono font-bold mr-1.5">{{ b.key }}</span>{{ b.title }}
                </NuxtLink>
              </li>
            </ul>
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
                  <div class="flex items-center gap-1.5 shrink-0">
                    <span class="text-xs text-muted/70">{{ formatDate(c.createdAt) }}</span>
                    <UButton
                      icon="i-lucide-trash-2"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      aria-label="Remover comentário"
                      @click="commentToDelete = c"
                    />
                  </div>
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

            <div v-if="!card.subtasks?.length">
              <label class="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
                História
              </label>
              <USelectMenu
                :model-value="card.parentId ?? null"
                :items="storyOptions"
                value-key="value"
                class="w-full"
                @update:model-value="(v: string | null) => patch({ parentId: v })"
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

  <UModal v-model:open="deleteCommentOpen" title="Remover comentário">
    <template #body>
      <p class="text-sm text-muted">
        Esta ação não pode ser desfeita. O comentário será removido
        permanentemente.
      </p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          variant="ghost"
          label="Cancelar"
          @click="commentToDelete = null"
        />
        <UButton
          color="error"
          label="Remover"
          :loading="deletingComment"
          @click="confirmDeleteComment"
        />
      </div>
    </template>
  </UModal>
</template>
