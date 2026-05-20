import type { Ref } from "vue";
import type { Sprint } from "~/types/sprint";

/**
 * Inline editing (name + goal) for a sprint with debounced auto-save.
 * Shared by the active-sprint board (/board) and the sprint detail
 * (/sprints/[id]). The caller owns the sprint ref and gets told, via
 * `onSaved`, to swap in the persisted sprint after each save.
 */
export function useSprintInlineEdit(
  sprint: Ref<Sprint | null | undefined>,
  onSaved?: (updated: Sprint) => void,
) {
  const api = useApi();

  const editing = reactive({ name: "", goal: "" });
  const saving = ref(false);
  const justSaved = ref(false);
  let savedTimer: ReturnType<typeof setTimeout> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Keep the editable fields in sync with the sprint, but never overwrite a
  // field the user is mid-editing — otherwise the realtime echo of our own
  // save (or another tab's edit) would clobber what's being typed.
  watch(
    sprint,
    (fresh, prev) => {
      if (!fresh) return;
      if (!prev || prev.id !== fresh.id) {
        editing.name = fresh.name;
        editing.goal = fresh.goal ?? "";
        return;
      }
      if (editing.name === prev.name && fresh.name !== editing.name) {
        editing.name = fresh.name;
      }
      if (
        editing.goal === (prev.goal ?? "") &&
        (fresh.goal ?? "") !== editing.goal
      ) {
        editing.goal = fresh.goal ?? "";
      }
    },
    { immediate: true },
  );

  async function patch(body: Record<string, unknown>) {
    if (!sprint.value) return;
    saving.value = true;
    try {
      const updated = await api<Sprint>(`/sprints/${sprint.value.id}`, {
        method: "PATCH",
        body,
      });
      onSaved?.(updated);
      justSaved.value = true;
      if (savedTimer) clearTimeout(savedTimer);
      savedTimer = setTimeout(() => {
        justSaved.value = false;
      }, 1500);
    } finally {
      saving.value = false;
    }
  }

  function scheduleSave() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (!sprint.value) return;
      const body: Record<string, unknown> = {};
      const trimmedName = editing.name.trim();
      if (trimmedName && trimmedName !== sprint.value.name) {
        body.name = trimmedName;
      }
      if (editing.goal !== (sprint.value.goal ?? "")) {
        body.goal = editing.goal.trim() ? editing.goal : null;
      }
      if (Object.keys(body).length > 0) patch(body);
    }, 800);
  }

  watch(() => [editing.name, editing.goal], scheduleSave);

  return { editing, saving, justSaved };
}
