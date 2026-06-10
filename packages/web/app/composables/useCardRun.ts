import { type MaybeRefOrGetter, ref, toValue } from 'vue'

import type { CardRun } from '@claude-organizer/shared'

/**
 * Drives the auto-implement runner for one card from the detail page: reads the
 * latest run, triggers a new one, and cancels a running one. Realtime is handled
 * by the page — every run transition emits a `card.changed`, so the page calls
 * `refresh()` from its event handler rather than this composable polling.
 */
export function useCardRun(cardKey: MaybeRefOrGetter<string>) {
  const api = useApi()
  const run = ref<CardRun | null>(null)
  const triggering = ref(false)
  const cancelling = ref(false)

  async function refresh() {
    const key = toValue(cardKey)
    if (!key) return
    const res = await api<{ run: CardRun | null }>(`/cards/${key}/auto-run`)
    run.value = res.run
  }

  // Both may reject (the engine maps eligibility/concurrency/claim to 400/409);
  // the caller surfaces the reason from `err.data.error`. The trigger POST returns
  // the accepted-run summary (not a full CardRun), so re-read the canonical row.
  async function trigger() {
    triggering.value = true
    try {
      await api(`/cards/${toValue(cardKey)}/auto-run`, { method: 'POST' })
      await refresh()
    } finally {
      triggering.value = false
    }
  }

  async function cancel() {
    cancelling.value = true
    try {
      await api(`/cards/${toValue(cardKey)}/auto-run/cancel`, { method: 'POST' })
      await refresh()
    } finally {
      cancelling.value = false
    }
  }

  return { run, triggering, cancelling, refresh, trigger, cancel }
}
