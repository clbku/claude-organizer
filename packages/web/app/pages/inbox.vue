<script setup lang="ts">
import type { Attachment } from '@claude-organizer/shared'

import { useProjectStore } from '~/stores/project'
import type { IntakeItem, IntakeStatus } from '~/types/intake'

const store = useProjectStore()
const { currentProject, currentProjectId } = storeToRefs(store)
const api = useApi()
const toast = useToast()

useHead({ title: 'Inbox' })

const pending = ref<IntakeItem[]>([])
const planned = ref<IntakeItem[]>([])
const archived = ref<IntakeItem[]>([])
const newBody = ref('')
const adding = ref(false)
const preview = ref<{ title: string, body: string | null } | null>(null)
const panelOpen = ref<Record<string, boolean>>({})
const attachOpen = ref<Record<string, boolean>>({})

// Staged uploads made while composing; their ids ride along on the create call
// (exposed `items`/`reset`/`uploading` from AttachmentsPanel — refs unwrap on
// the instance). Submit stays disabled while an upload is in flight, or its
// row would miss the snapshot and silently orphan.
const stagedPanel = ref<{
  items: Attachment[]
  reset: () => void
  uploading: boolean
} | null>(null)

// The pending item being edited; its editor binds to useAutoSave's buffer, kept
// out of the reloaded lists so a realtime echo can't clobber an in-flight edit.
const current = ref<IntakeItem | null>(null)

const { editing, saving, justSaved, flush } = useAutoSave<IntakeItem, 'bodyMd'>(
  current,
  {
    resource: 'intake',
    // `required`: a blank body is never PATCHed (the API rejects min(1)); the
    // inline hint tells the user to archive/destroy instead of emptying it.
    fields: [{ key: 'bodyMd', mode: 'required' }],
    onSaved: (updated) => {
      const item = pending.value.find(i => i.id === updated.id)
      if (item) item.bodyMd = updated.bodyMd
    }
  }
)

function startEdit(item: IntakeItem) {
  current.value = item
  editing.bodyMd = item.bodyMd ?? ''
}
function stopEdit() {
  // Force the pending save before detaching: click-outside often lands inside
  // the 800ms debounce window, and nulling `current` first would strand the edit.
  flush()
  current.value = null
}
const bodyModel = (item: IntakeItem) =>
  current.value?.id === item.id ? editing.bodyMd : (item.bodyMd ?? '')
function onBodyInput(item: IntakeItem, value: string) {
  if (current.value?.id === item.id) editing.bodyMd = value
}
const isEmptyEdit = (item: IntakeItem) =>
  current.value?.id === item.id && !editing.bodyMd.trim()

let enrichingPollTimer: ReturnType<typeof setInterval> | null = null
// Monotonic load id. Concurrent reloads (the 3s poll, realtime echoes, an
// explicit add) can resolve out of order; only the latest may write the lists,
// so a slow earlier response can't clobber a fresher one — which is what made a
// just-added item vanish until a manual refresh.
let loadSeq = 0

async function loadInbox() {
  if (!currentProjectId.value) {
    pending.value = []
    planned.value = []
    archived.value = []
    return
  }
  const seq = ++loadSeq
  const path = `/projects/${currentProjectId.value}/intake`
  const [p, enrichingItems, enrichedItems, pl, a] = await Promise.all([
    api<IntakeItem[]>(path, { query: { status: 'pending' } }),
    api<IntakeItem[]>(path, { query: { status: 'enriching' } }),
    api<IntakeItem[]>(path, { query: { status: 'enriched' } }),
    api<IntakeItem[]>(path, { query: { status: 'planned' } }),
    api<IntakeItem[]>(path, { query: { status: 'archived' } })
  ])
  if (seq !== loadSeq) return
  // pending section: pending + enriching + enriched, newest first
  pending.value = [...p, ...enrichingItems, ...enrichedItems].sort(
    (x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime()
  )
  planned.value = pl
  archived.value = a
  // Re-point the edited item at its refreshed object so smart-sync can follow.
  if (current.value) {
    current.value = pending.value.find(i => i.id === current.value!.id) ?? null
  }
  const hasEnriching = pending.value.some(i => i.status === 'enriching')
  if (hasEnriching && !enrichingPollTimer) {
    enrichingPollTimer = setInterval(loadInbox, 3000)
  } else if (!hasEnriching && enrichingPollTimer) {
    clearInterval(enrichingPollTimer)
    enrichingPollTimer = null
  }
}

onUnmounted(() => {
  if (enrichingPollTimer) clearInterval(enrichingPollTimer)
})

// A planned item's `completed` is derived from its cards' status, so a card
// moving to/from `done` (a card.changed with no intake write) must re-bucket it.
// Archive/destroy already cascade through inbox.* events; here we only need the
// read-derived path, and only when the card is actually referenced.
function isPlannedCard(key: string | undefined) {
  if (!key) return false
  return planned.value.some(i =>
    (i.plannedCardKeys ?? '').split(',').includes(key)
  )
}

useProjectData(currentProjectId, loadInbox, {
  onEvent: (event) => {
    if (event.type === 'inbox.changed' || event.type === 'inbox.deleted') {
      loadInbox()
    } else if (event.type === 'card.changed' && isPlannedCard(event.cardKey)) {
      loadInbox()
    }
  }
})

async function addItem() {
  const body = newBody.value.trim()
  if (!body || !currentProjectId.value || adding.value) return
  if (stagedPanel.value?.uploading) return
  adding.value = true
  try {
    const attachmentIds = stagedPanel.value?.items.map(a => a.id) ?? []
    const created = await api<IntakeItem>(`/projects/${currentProjectId.value}/intake`, {
      method: 'POST',
      body: { bodyMd: body, attachmentIds }
    })
    newBody.value = ''
    stagedPanel.value?.reset()
    // Show the new item instantly, before the reload round-trip; loadInbox()
    // then reconciles from the server (dedup by id keeps it single).
    if (created && !pending.value.some(i => i.id === created.id)) {
      pending.value = [created, ...pending.value]
    }
    await loadInbox()
  } finally {
    adding.value = false
  }
}

function onQuickAddKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    addItem()
  }
}

async function setStatus(id: string, status: IntakeStatus) {
  if (current.value?.id === id) stopEdit()
  await api(`/intake/${id}`, { method: 'PATCH', body: { status } })
  await loadInbox()
}

const confirming = ref<string | null>(null)
async function confirmEnrichment(id: string) {
  confirming.value = id
  try {
    await api(`/intake/${id}/confirm`, { method: 'POST' })
    await loadInbox()
  } catch {
    toast.add({ title: 'Could not confirm enrichment', description: 'The demand may have changed. Please refresh and try again.', color: 'error' })
  } finally {
    confirming.value = null
  }
}

const destroyTarget = ref<IntakeItem | null>(null)
const destroying = ref(false)
async function confirmDestroy() {
  if (!destroyTarget.value) return
  destroying.value = true
  try {
    if (current.value?.id === destroyTarget.value.id) current.value = null
    await api(`/intake/${destroyTarget.value.id}`, { method: 'DELETE' })
    destroyTarget.value = null
    await loadInbox()
  } finally {
    destroying.value = false
  }
}

const plannedActive = computed(() => planned.value.filter(i => !i.completed))
const plannedCompleted = computed(() => planned.value.filter(i => i.completed))
</script>

<template>
  <UDashboardPanel id="inbox">
    <template #header>
      <UDashboardNavbar title="Inbox">
        <template #leading>
          <UDashboardSidebarCollapse />
          <UIcon name="i-lucide-inbox" class="text-primary" />
        </template>
        <template #right>
          <span
            v-if="saving"
            class="text-xs text-muted flex items-center gap-1"
          >
            <UIcon name="i-lucide-loader-2" class="animate-spin" /> Saving…
          </span>
          <span
            v-else-if="justSaved"
            class="text-xs text-muted flex items-center gap-1"
          >
            <UIcon name="i-lucide-check" /> Saved
          </span>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="!currentProject" class="text-center text-muted py-12 w-full">
        Pick a project in the sidebar.
      </div>

      <div v-else class="max-w-3xl mx-auto w-full space-y-6">
        <div class="space-y-2" @keydown="onQuickAddKeydown">
          <MarkdownEditor
            v-model="newBody"
            min-height="80px"
            placeholder="Capture a raw demand… (markdown, ⌘/Ctrl+Enter to add)"
          />
          <AttachmentsPanel
            v-if="currentProjectId"
            :key="currentProjectId"
            ref="stagedPanel"
            :scope="{ kind: 'staging', projectId: currentProjectId }"
          />
          <div class="flex justify-end">
            <UButton
              icon="i-lucide-plus"
              label="Add to inbox"
              color="primary"
              :loading="adding"
              :disabled="!newBody.trim() || stagedPanel?.uploading"
              @click="addItem"
            />
          </div>
        </div>

        <div class="space-y-2">
          <h2 class="text-xs font-semibold uppercase text-muted tracking-wide">
            Pending ({{ pending.length }})
          </h2>
          <div v-if="!pending.length" class="text-sm text-muted/60 italic">
            No pending demands. Capture one above.
          </div>
          <div
            v-for="item in pending"
            :key="item.id"
            class="group relative rounded-md border border-default overflow-hidden"
          >
            <InlineEditable
              type="markdown"
              min-height="80px"
              placeholder="Empty demand"
              editor-placeholder="Describe the demand… (markdown)"
              :model-value="bodyModel(item)"
              @update:model-value="(v: string) => onBodyInput(item, v)"
              @edit-start="startEdit(item)"
              @edit-stop="stopEdit"
            />
            <p v-if="isEmptyEdit(item)" class="mx-3 mb-2 text-xs text-error">
              A demand can't be empty — archive or destroy it instead.
            </p>

            <!-- Enrichment status row -->
            <div v-if="item.status === 'enriching'" class="px-3 pb-2">
              <UBadge color="warning" variant="subtle" size="sm">
                <UIcon name="i-lucide-loader-2" class="animate-spin size-3 mr-1" />
                Enriching…
              </UBadge>
            </div>
            <div
              v-else-if="item.status === 'enriched'"
              class="px-3 pb-2 flex items-center justify-between"
            >
              <UBadge
                color="success"
                variant="subtle"
                size="sm"
                label="Ready to confirm"
              />
              <UButton
                size="xs"
                color="primary"
                variant="soft"
                icon="i-lucide-circle-check"
                label="Confirm enrichment"
                :loading="confirming === item.id"
                @click="confirmEnrichment(item.id)"
              />
            </div>
            <div v-else-if="item.enrichedBodyMd" class="px-3 pb-2">
              <UBadge
                color="neutral"
                variant="subtle"
                size="sm"
                label="Enriched"
              />
            </div>

            <!-- Collapsible enrichment outputs panel -->
            <div v-if="item.enrichedBodyMd" class="border-t border-default">
              <button
                type="button"
                class="flex items-center gap-1.5 w-full px-3 py-2 text-xs font-medium text-muted hover:text-default hover:bg-elevated/50 transition text-left"
                @click="panelOpen[item.id] = !panelOpen[item.id]"
              >
                <UIcon
                  :name="panelOpen[item.id] ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                  class="size-3 shrink-0"
                />
                Enrichment details
              </button>
              <div v-if="panelOpen[item.id]" class="px-3 pb-3 space-y-3">
                <div class="space-y-1">
                  <p class="text-xs font-semibold text-muted">
                    Rewritten description
                  </p>
                  <AppMarkdown :value="item.enrichedBodyMd" :class="PROSE" />
                </div>
                <div v-if="item.contextNotesMd" class="space-y-1">
                  <p class="text-xs font-semibold text-muted">
                    Context notes
                  </p>
                  <AppMarkdown :value="item.contextNotesMd" :class="PROSE" />
                </div>
                <div v-if="item.draftPlanMd" class="space-y-1">
                  <p class="text-xs font-semibold text-muted">
                    Draft plan
                  </p>
                  <AppMarkdown :value="item.draftPlanMd" :class="PROSE" />
                </div>
              </div>
            </div>

            <!-- Collapsible attachments panel -->
            <div class="border-t border-default">
              <button
                type="button"
                class="flex items-center gap-1.5 w-full px-3 py-2 text-xs font-medium text-muted hover:text-default hover:bg-elevated/50 transition text-left"
                @click="attachOpen[item.id] = !attachOpen[item.id]"
              >
                <UIcon
                  :name="attachOpen[item.id] ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                  class="size-3 shrink-0"
                />
                <UIcon name="i-lucide-paperclip" class="size-3 shrink-0" />
                Attachments
                <span v-if="item.attachmentCount" class="text-default">
                  ({{ item.attachmentCount }})
                </span>
              </button>
              <div v-if="attachOpen[item.id]" class="px-3 pb-3">
                <AttachmentsPanel
                  :scope="{ kind: 'intake', intakeItemId: item.id }"
                  @changed="loadInbox"
                />
              </div>
            </div>

            <!-- Action overlay -->
            <div
              v-if="current?.id !== item.id"
              class="absolute top-2 right-2 flex items-center gap-0.5 rounded-md bg-default/80 backdrop-blur-sm opacity-0 transition group-hover:opacity-100 focus-within:opacity-100"
            >
              <UButton
                icon="i-lucide-archive"
                size="xs"
                color="neutral"
                variant="ghost"
                aria-label="Archive"
                @click="setStatus(item.id, 'archived')"
              />
              <UButton
                icon="i-lucide-trash-2"
                size="xs"
                color="neutral"
                variant="ghost"
                aria-label="Destroy"
                @click="destroyTarget = item"
              />
            </div>
          </div>
        </div>

        <div v-if="plannedActive.length" class="space-y-2">
          <h2 class="text-xs font-semibold uppercase text-muted tracking-wide">
            Planned ({{ plannedActive.length }})
          </h2>
          <IntakePlannedItem
            v-for="item in plannedActive"
            :key="item.id"
            :item="item"
            @archive="setStatus(item.id, 'archived')"
            @destroy="destroyTarget = item"
          />
        </div>

        <div v-if="plannedCompleted.length">
          <ArchivedDisclosure
            :count="plannedCompleted.length"
            label="Completed"
            icon="i-lucide-circle-check-big"
          >
            <div class="space-y-2">
              <IntakePlannedItem
                v-for="item in plannedCompleted"
                :key="item.id"
                :item="item"
                @archive="setStatus(item.id, 'archived')"
                @destroy="destroyTarget = item"
              />
            </div>
          </ArchivedDisclosure>
        </div>

        <div v-if="archived.length">
          <ArchivedDisclosure :count="archived.length">
            <div class="space-y-1">
              <div
                v-for="item in archived"
                :key="item.id"
                class="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-elevated/50"
              >
                <button
                  type="button"
                  class="flex-1 min-w-0 cursor-pointer text-left"
                  @click="preview = { title: 'Archived demand', body: item.bodyMd }"
                >
                  <AppMarkdown
                    :value="item.bodyMd"
                    class="text-muted line-clamp-1 pointer-events-none"
                  />
                </button>
                <UButton
                  icon="i-lucide-archive-restore"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  aria-label="Restore"
                  @click="setStatus(item.id, 'pending')"
                />
                <UButton
                  icon="i-lucide-trash-2"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  aria-label="Destroy"
                  @click="destroyTarget = item"
                />
              </div>
            </div>
          </ArchivedDisclosure>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <ArchivedPreviewModal
    :open="!!preview"
    :title="preview?.title"
    :body="preview?.body"
    @update:open="(v) => { if (!v) preview = null }"
  />

  <UModal
    :open="!!destroyTarget"
    title="Destroy demand?"
    @update:open="(v) => { if (!v) destroyTarget = null }"
  >
    <template #body>
      <p class="text-sm text-muted">
        This will permanently delete this inbox demand.
        <strong class="text-error">This can't be undone.</strong>
      </p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton variant="ghost" label="Cancel" @click="destroyTarget = null" />
        <UButton
          color="error"
          icon="i-lucide-trash-2"
          label="Destroy"
          :loading="destroying"
          @click="confirmDestroy"
        />
      </div>
    </template>
  </UModal>
</template>
