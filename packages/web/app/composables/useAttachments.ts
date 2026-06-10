import type { Attachment } from '@claude-organizer/shared'
import {
  INBOX_IMAGE_TYPES,
  MAX_INBOX_IMAGE_BYTES
} from '@claude-organizer/shared'

/**
 * Whose attachments a panel works on: a card (any file type), an intake item,
 * or the staging area of a project — uploads made while composing an intake
 * item that doesn't exist yet, associated on submit via `attachmentIds`.
 */
export type AttachmentScope
  = | { kind: 'card', cardId: string }
    | { kind: 'intake', intakeItemId: string }
    | { kind: 'staging', projectId: string }

const inboxImageTypes = new Set<string>(INBOX_IMAGE_TYPES)

/**
 * CRUD for an attachment set. Bytes are fetched with the session cookie and
 * handed back as object URLs: a direct `<img src>` to the cross-origin API
 * would not carry the cookie (SameSite), so images would fail to load under
 * auth. Staging has no list endpoint — its items live in local state from the
 * upload responses (a reload forgets them; the server sweep reaps the files).
 */
export function useAttachments(scope: AttachmentScope) {
  const api = useApi()
  const items = ref<Attachment[]>([])
  const loading = ref(false)
  const uploading = ref(false)

  const listPath
    = scope.kind === 'card'
      ? `/cards/${scope.cardId}/attachments`
      : scope.kind === 'intake'
        ? `/intake/${scope.intakeItemId}/attachments`
        : null
  const uploadPath
    = scope.kind === 'card'
      ? `/cards/${scope.cardId}/attachments`
      : scope.kind === 'intake'
        ? `/intake/${scope.intakeItemId}/attachments`
        : `/projects/${scope.projectId}/uploads/attachments`

  async function refresh() {
    if (!listPath) return
    loading.value = true
    try {
      items.value = await api<Attachment[]>(listPath)
    } finally {
      loading.value = false
    }
  }

  async function upload(file: File) {
    // Inbox attachments are images only and capped before upload — mirror the
    // API rule client-side so the user gets the error without the round-trip.
    if (scope.kind !== 'card') {
      if (!inboxImageTypes.has(file.type)) {
        throw new Error(
          'Only JPEG, PNG, GIF or WebP images can be attached to inbox items'
        )
      }
      if (file.size > MAX_INBOX_IMAGE_BYTES) {
        throw new Error(
          `Image exceeds the ${MAX_INBOX_IMAGE_BYTES / (1024 * 1024)}MB inbox limit`
        )
      }
    }
    const form = new FormData()
    form.append('file', file)
    uploading.value = true
    try {
      const row = await api<Attachment>(uploadPath, {
        method: 'POST',
        body: form
      })
      if (listPath) await refresh()
      else items.value = [row, ...items.value]
    } finally {
      uploading.value = false
    }
  }

  async function remove(id: string) {
    await api(`/attachments/${id}`, { method: 'DELETE' })
    if (listPath) await refresh()
    else items.value = items.value.filter(a => a.id !== id)
  }

  /** Forget local state (staged uploads just associated on submit). */
  function reset() {
    items.value = []
  }

  async function fetchObjectUrl(id: string): Promise<string> {
    const blob = await api<Blob>(`/attachments/${id}/file`, {
      responseType: 'blob'
    })
    return URL.createObjectURL(blob)
  }

  return {
    items,
    loading,
    uploading,
    refresh,
    upload,
    remove,
    reset,
    fetchObjectUrl
  }
}
