import type { Ref } from 'vue'

import type { Sprint } from '~/types/sprint'

/**
 * Inline editing (name + goal) for a sprint with debounced auto-save.
 * Shared by the active-sprint board (/board) and the sprint detail
 * (/sprints/[id]). The caller owns the sprint ref and gets told, via
 * `onSaved`, to swap in the persisted sprint after each save.
 *
 * A thin wrapper over `useAutoSave` — name is required, goal is nullable.
 */
export function useSprintInlineEdit(
  sprint: Ref<Sprint | null | undefined>,
  onSaved?: (updated: Sprint) => void
) {
  const { editing, saving, justSaved } = useAutoSave<Sprint, 'name' | 'goal'>(sprint, {
    resource: 'sprints',
    fields: [
      { key: 'name', mode: 'required' },
      { key: 'goal', mode: 'nullable' }
    ],
    onSaved
  })

  return { editing, saving, justSaved }
}
