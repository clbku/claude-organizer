import type { CardAttachment } from '@claude-organizer/shared'

/**
 * CRUD for a card's attachments. Bytes are fetched with the session cookie and
 * handed back as object URLs: a direct `<img src>` to the cross-origin API would
 * not carry the cookie (SameSite), so images would fail to load under auth.
 */
export function useCardAttachments(cardId: string) {
  const api = useApi()
  const items = ref<CardAttachment[]>([])
  const loading = ref(false)
  const uploading = ref(false)

  async function refresh() {
    loading.value = true
    try {
      items.value = await api<CardAttachment[]>(`/cards/${cardId}/attachments`)
    } finally {
      loading.value = false
    }
  }

  async function upload(file: File) {
    const form = new FormData()
    form.append('file', file)
    uploading.value = true
    try {
      await api(`/cards/${cardId}/attachments`, { method: 'POST', body: form })
      await refresh()
    } finally {
      uploading.value = false
    }
  }

  async function remove(id: string) {
    await api(`/attachments/${id}`, { method: 'DELETE' })
    await refresh()
  }

  async function fetchObjectUrl(id: string): Promise<string> {
    const blob = await api<Blob>(`/attachments/${id}/file`, {
      responseType: 'blob'
    })
    return URL.createObjectURL(blob)
  }

  return { items, loading, uploading, refresh, upload, remove, fetchObjectUrl }
}
