<script setup lang="ts">
import type { Attachment } from '@claude-organizer/shared'
import {
  INBOX_IMAGE_TYPES,
  MAX_INBOX_IMAGE_BYTES
} from '@claude-organizer/shared'

// Attachment panel for any owner (see AttachmentScope): upload (drag-drop or
// click), preview images in a lightbox, download any file, delete with
// confirmation. The parent may seed an already-loaded list and listens to
// `changed` to refresh its badge/done-guard. For the staging scope the parent
// reads `items` (exposed) for the ids to submit, then calls `reset()`.
const props = withDefaults(
  defineProps<{ scope: AttachmentScope, attachments?: Attachment[] }>(),
  { attachments: () => [] }
)
const emit = defineEmits<{ changed: [] }>()

const toast = useToast()
const { items, uploading, refresh, upload, remove, reset, fetchObjectUrl }
  = useAttachments(props.scope)

items.value = props.attachments
onMounted(refresh)

defineExpose({ items, reset, uploading })

const imagesOnly = computed(() => props.scope.kind !== 'card')
const hint = computed(() =>
  imagesOnly.value
    ? `JPEG, PNG, GIF or WebP up to ${MAX_INBOX_IMAGE_BYTES / (1024 * 1024)}MB.`
    : 'Images are compressed; max 20MB after compression.'
)

const lightbox = ref<Attachment | null>(null)

// Object URLs for image previews: built as the list changes, revoked when an
// item leaves or the panel unmounts (see useAttachments for the why). The
// sequence token drops a run superseded mid-flight so its URLs don't leak.
const objectUrls = ref<Record<string, string>>({})
let syncToken = 0
watch(
  items,
  async (list) => {
    const token = ++syncToken
    const live = new Set(list.map(a => a.id))
    // Drop the lightbox if its image is no longer in the list.
    if (lightbox.value && !live.has(lightbox.value.id)) lightbox.value = null
    const next: Record<string, string> = {}
    const created: string[] = []
    for (const [id, url] of Object.entries(objectUrls.value)) {
      if (live.has(id)) next[id] = url
      else URL.revokeObjectURL(url)
    }
    for (const a of list) {
      if (isImageMime(a.mimeType) && !next[a.id]) {
        try {
          const url = await fetchObjectUrl(a.id)
          next[a.id] = url
          created.push(url)
        } catch {
          // A missing/inaccessible file just falls back to the file row.
        }
      }
    }
    if (token !== syncToken) {
      for (const url of created) URL.revokeObjectURL(url)
      return
    }
    objectUrls.value = next
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  // Invalidate any in-flight watch run so it revokes the URLs it just created
  // instead of assigning them after the panel is gone (collapse-mid-fetch).
  syncToken++
  for (const url of Object.values(objectUrls.value)) URL.revokeObjectURL(url)
})

const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)

async function handleFiles(files: FileList | null | undefined) {
  if (!files?.length) return
  let uploaded = 0
  for (const file of Array.from(files)) {
    try {
      await upload(file)
      uploaded++
    } catch (err) {
      toast.add({
        title: `Upload failed: ${file.name}`,
        description: resolveError(err),
        color: 'error',
        icon: 'i-lucide-triangle-alert'
      })
    }
  }
  if (uploaded > 0) emit('changed')
}

function onInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  void handleFiles(input.files).then(() => {
    input.value = ''
  })
}

const lightboxOpen = computed({
  get: () => lightbox.value !== null,
  set: (open) => {
    if (!open) lightbox.value = null
  }
})

async function download(att: Attachment) {
  try {
    const reused = objectUrls.value[att.id]
    const url = reused ?? (await fetchObjectUrl(att.id))
    const a = document.createElement('a')
    a.href = url
    a.download = att.filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Free a one-off URL (non-image) once the browser has taken the download —
    // revoking synchronously can cancel it mid-flight in some browsers.
    if (!reused) setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (err) {
    toast.add({
      title: 'Download failed',
      description: resolveError(err),
      color: 'error'
    })
  }
}

const toDelete = ref<Attachment | null>(null)
const deleting = ref(false)
const deleteOpen = computed({
  get: () => toDelete.value !== null,
  set: (open) => {
    if (!open) toDelete.value = null
  }
})

async function confirmDelete() {
  if (!toDelete.value) return
  deleting.value = true
  try {
    await remove(toDelete.value.id)
    toDelete.value = null
    emit('changed')
  } catch (err) {
    toast.add({
      title: 'Delete failed',
      description: resolveError(err),
      color: 'error'
    })
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <section>
    <h2
      v-if="scope.kind === 'card'"
      class="text-xs font-semibold text-muted uppercase tracking-wide mb-3"
    >
      Attachments
      <span v-if="items.length" class="text-default ml-1">({{ items.length }})</span>
    </h2>

    <div
      role="button"
      tabindex="0"
      class="border border-dashed border-default rounded-md px-4 py-6 text-center cursor-pointer transition hover:border-primary/40"
      :class="dragging ? 'border-primary bg-primary/5' : ''"
      @click="fileInput?.click()"
      @keydown.enter.prevent="fileInput?.click()"
      @keydown.space.prevent="fileInput?.click()"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="dragging = false; handleFiles($event.dataTransfer?.files)"
    >
      <UIcon name="i-lucide-upload" class="size-5 text-muted mx-auto mb-1.5" />
      <p class="text-sm text-muted">
        <span class="text-primary font-medium">Click to upload</span>
        or drag {{ imagesOnly ? 'an image' : 'a file' }} here
      </p>
      <p class="text-xs text-muted/60 mt-0.5">
        {{ hint }}
      </p>
      <input
        ref="fileInput"
        type="file"
        :accept="imagesOnly ? INBOX_IMAGE_TYPES.join(',') : undefined"
        class="hidden"
        @change="onInputChange"
      >
    </div>

    <p v-if="uploading" class="text-xs text-muted mt-2 flex items-center gap-1">
      <UIcon name="i-lucide-loader-2" class="animate-spin" /> Uploading…
    </p>

    <ul v-if="items.length" class="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
      <li
        v-for="a in items"
        :key="a.id"
        class="border border-default rounded-md overflow-hidden"
      >
        <button
          v-if="isImageMime(a.mimeType) && objectUrls[a.id]"
          type="button"
          class="block w-full aspect-video bg-elevated/40"
          @click="lightbox = a"
        >
          <img
            :src="objectUrls[a.id]"
            :alt="a.filename"
            class="w-full h-full object-cover"
          >
        </button>
        <div v-else class="flex items-center gap-2 px-2.5 py-3 min-w-0">
          <UIcon :name="fileIcon(a.mimeType)" class="size-5 shrink-0 text-muted" />
          <span class="text-xs truncate min-w-0 flex-1" :title="a.filename">
            {{ a.filename }}
          </span>
        </div>

        <div class="flex items-center gap-1 px-2 py-1 border-t border-default bg-default">
          <span class="text-[11px] text-muted/70 truncate min-w-0 flex-1">
            {{ formatBytes(a.size) }}
          </span>
          <UButton
            icon="i-lucide-download"
            size="xs"
            color="neutral"
            variant="ghost"
            aria-label="Download"
            @click="download(a)"
          />
          <UButton
            icon="i-lucide-trash-2"
            size="xs"
            color="neutral"
            variant="ghost"
            aria-label="Delete attachment"
            @click="toDelete = a"
          />
        </div>
      </li>
    </ul>
  </section>

  <UModal v-model:open="lightboxOpen" :title="lightbox?.filename">
    <template #body>
      <img
        v-if="lightbox && objectUrls[lightbox.id]"
        :src="objectUrls[lightbox.id]"
        :alt="lightbox.filename"
        class="max-h-[75vh] w-full object-contain"
      >
    </template>
  </UModal>

  <UModal v-model:open="deleteOpen" title="Delete attachment">
    <template #body>
      <p class="text-sm text-muted">
        Delete <strong>{{ toDelete?.filename }}</strong>? This removes the file
        permanently and can't be undone.
      </p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton variant="ghost" label="Cancel" @click="toDelete = null" />
        <UButton
          color="error"
          label="Delete"
          :loading="deleting"
          @click="confirmDelete"
        />
      </div>
    </template>
  </UModal>
</template>
