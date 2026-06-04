<script setup lang="ts">
import { useProjectStore } from '~/stores/project'
import type { IntakeItem } from '~/types/intake'

const store = useProjectStore()
const { currentProject, currentProjectId } = storeToRefs(store)
const api = useApi()

useHead({ title: 'Inbox' })

const pending = ref<IntakeItem[]>([])
const planned = ref<IntakeItem[]>([])
const archived = ref<IntakeItem[]>([])
const newBody = ref('')
const adding = ref(false)

// The pending item being edited; its editor binds to useAutoSave's buffer, kept
// out of the reloaded lists so a realtime echo can't clobber an in-flight edit.
const current = ref<IntakeItem | null>(null)

const { editing, saving, justSaved } = useAutoSave<IntakeItem, 'bodyMd'>(
  current,
  {
    resource: 'intake',
    fields: ['bodyMd'],
    onSaved: (updated) => {
      const item = pending.value.find(i => i.id === updated.id)
      if (item) item.bodyMd = updated.bodyMd
    }
  }
)

async function loadInbox() {
  if (!currentProjectId.value) {
    pending.value = []
    planned.value = []
    archived.value = []
    return
  }
  const path = `/projects/${currentProjectId.value}/intake`
  const [p, pl, a] = await Promise.all([
    api<IntakeItem[]>(path, { query: { status: 'pending' } }),
    api<IntakeItem[]>(path, { query: { status: 'planned' } }),
    api<IntakeItem[]>(path, { query: { status: 'archived' } })
  ])
  pending.value = p
  planned.value = pl
  archived.value = a
  // Re-point the edited item at its refreshed object so smart-sync can follow.
  if (current.value) {
    current.value = pending.value.find(i => i.id === current.value!.id) ?? null
  }
}

useProjectData(currentProjectId, loadInbox, {
  onEvent: (event) => {
    if (event.type === 'inbox.changed' || event.type === 'inbox.deleted') {
      loadInbox()
    }
  }
})

async function addItem() {
  const body = newBody.value.trim()
  if (!body || !currentProjectId.value || adding.value) return
  adding.value = true
  try {
    await api(`/projects/${currentProjectId.value}/intake`, {
      method: 'POST',
      body: { bodyMd: body }
    })
    newBody.value = ''
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

async function archiveItem(id: string) {
  if (current.value?.id === id) current.value = null
  await api(`/intake/${id}`, { method: 'PATCH', body: { status: 'archived' } })
  await loadInbox()
}
async function restoreItem(id: string) {
  await api(`/intake/${id}`, { method: 'PATCH', body: { status: 'pending' } })
  await loadInbox()
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

const plannedKeys = (item: IntakeItem) =>
  (item.plannedCardKeys ?? '').split(',').filter(Boolean).join(', ')
</script>

<template>
  <UDashboardPanel id="inbox">
    <template #header>
      <UDashboardNavbar title="Inbox">
        <template #leading>
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
        <div class="space-y-2">
          <UTextarea
            v-model="newBody"
            :rows="3"
            autoresize
            class="w-full"
            placeholder="Capture a raw demand… (markdown supported, ⌘/Ctrl+Enter to add)"
            @keydown="onQuickAddKeydown"
          />
          <div class="flex justify-end">
            <UButton
              icon="i-lucide-plus"
              label="Add to inbox"
              color="primary"
              :loading="adding"
              :disabled="!newBody.trim()"
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
          <UCard
            v-for="item in pending"
            :key="item.id"
            :ui="{ body: 'sm:p-4' }"
          >
            <div class="flex items-start gap-2">
              <div class="flex-1 min-w-0">
                <MarkdownEditor
                  v-if="current?.id === item.id"
                  v-model="editing.bodyMd"
                  autofocus
                  min-height="80px"
                  placeholder="Describe the demand… (markdown)"
                />
                <div
                  v-else
                  class="cursor-text rounded-md px-3 py-2 min-h-10 hover:bg-elevated/30"
                  @click="current = item"
                >
                  <AppMarkdown v-if="item.bodyMd" :value="item.bodyMd" />
                  <span v-else class="text-sm text-muted/50 italic">Empty demand</span>
                </div>
              </div>
              <div class="flex items-center gap-0.5 shrink-0">
                <UButton
                  v-if="current?.id === item.id"
                  icon="i-lucide-check"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  aria-label="Done editing"
                  @click="current = null"
                />
                <UButton
                  icon="i-lucide-archive"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  aria-label="Archive"
                  @click="archiveItem(item.id)"
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
          </UCard>
        </div>

        <div v-if="planned.length" class="space-y-2">
          <h2 class="text-xs font-semibold uppercase text-muted tracking-wide">
            Planned ({{ planned.length }})
          </h2>
          <UCard v-for="item in planned" :key="item.id" :ui="{ body: 'sm:p-4' }">
            <div class="flex items-start gap-2">
              <div class="flex-1 min-w-0 space-y-1.5">
                <AppMarkdown :value="item.bodyMd" class="text-sm" />
                <div class="flex items-center gap-1.5 text-xs text-muted">
                  <UBadge color="success" variant="subtle" size="sm" label="Planned" />
                  <span>→</span>
                  <AppMarkdown :value="plannedKeys(item)" />
                </div>
              </div>
              <div class="flex items-center gap-0.5 shrink-0">
                <UButton
                  icon="i-lucide-archive"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  aria-label="Archive"
                  @click="archiveItem(item.id)"
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
          </UCard>
        </div>

        <div v-if="archived.length">
          <ArchivedDisclosure :count="archived.length">
            <div class="space-y-1">
              <div
                v-for="item in archived"
                :key="item.id"
                class="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-elevated/50"
              >
                <AppMarkdown
                  :value="item.bodyMd"
                  class="flex-1 min-w-0 text-muted line-clamp-1"
                />
                <UButton
                  icon="i-lucide-archive-restore"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  aria-label="Restore"
                  @click="restoreItem(item.id)"
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
