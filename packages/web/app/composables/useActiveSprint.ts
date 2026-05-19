import type { MaybeRefOrGetter } from "vue";

export interface Sprint {
  id: string;
  projectId: string;
  roadmapId: string | null;
  name: string;
  goal: string | null;
  status: "planned" | "active" | "completed" | "cancelled";
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

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
