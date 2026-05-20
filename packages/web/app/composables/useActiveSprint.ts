import type { MaybeRefOrGetter } from "vue";
import type { Sprint } from "~/types/sprint";

export function useActiveSprint(projectId: MaybeRefOrGetter<string | null>) {
  const api = useApi();
  const id = computed(() => toValue(projectId));

  return useAsyncData<Sprint | null>(
    () => `active-sprint:${id.value ?? "none"}`,
    () => {
      if (!id.value) return Promise.resolve(null);
      return api<Sprint | null>("/sprints/active", {
        query: { projectId: id.value },
      });
    },
    { watch: [id] },
  );
}
