// Helpers shared by the attachment panel, the board and the card detail page.

export function isImageMime(mime: string): boolean {
  return mime.startsWith('image/')
}

export function fileIcon(mime: string): string {
  if (mime.startsWith('image/')) return 'i-lucide-image'
  if (mime.startsWith('video/')) return 'i-lucide-video'
  if (mime.startsWith('audio/')) return 'i-lucide-music'
  if (mime === 'application/pdf') return 'i-lucide-file-text'
  if (mime.includes('zip') || mime.includes('tar') || mime.includes('compressed')) {
    return 'i-lucide-file-archive'
  }
  return 'i-lucide-file'
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(1)} ${units[i]}`
}

/**
 * The core's proof-of-work guard rejects a move to `done` with HTTP 400 and
 * `code: 'invalid_input'` (see the API error-handler — it is NOT a 422). Detect
 * exactly that rejection so the UI can guide the user to attach a file instead
 * of showing a generic failure; returns the message, or null for any other error.
 */
export function proofOfWorkError(err: unknown): string | null {
  const data = (err as { data?: { code?: string, error?: string } })?.data
  if (data?.code === 'invalid_input' && data.error?.includes('Proof of work')) {
    return data.error
  }
  return null
}
