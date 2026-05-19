import { defineStore } from "pinia";

export interface Project {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  keyPrefix: string;
  nextKeySeq: number;
  createdAt: string;
  updatedAt: string;
}

const CURRENT_PROJECT_COOKIE = "organizer.currentProjectSlug";

export const useProjectStore = defineStore("project", () => {
  const projects = ref<Project[]>([]);
  const loading = ref(true);
  const currentSlug = useCookie<string | null>(CURRENT_PROJECT_COOKIE, {
    default: () => null,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });

  const currentProject = computed<Project | null>(() => {
    if (!currentSlug.value) return projects.value[0] ?? null;
    return projects.value.find((p) => p.slug === currentSlug.value) ?? null;
  });

  const currentProjectId = computed(() => currentProject.value?.id ?? null);

  async function loadProjects() {
    const api = useApi();
    try {
      projects.value = await api<Project[]>("/projects");
    } finally {
      loading.value = false;
    }
  }

  function setCurrent(slug: string) {
    if (projects.value.some((p) => p.slug === slug)) {
      currentSlug.value = slug;
    }
  }

  async function ensureLoaded() {
    if (projects.value.length === 0) {
      await loadProjects();
    }
  }

  return {
    projects,
    loading,
    currentProject,
    currentProjectId,
    currentSlug,
    loadProjects,
    setCurrent,
    ensureLoaded,
  };
});
