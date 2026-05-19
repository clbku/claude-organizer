<script setup lang="ts">
import { useProjectStore } from "~/stores/project";

const store = useProjectStore();
const { projects, currentProject } = storeToRefs(store);

const api = useApi();
const open = ref(false);
const form = reactive({
  name: "",
  slug: "",
  description: "",
  keyPrefix: "",
});

function derivePrefixFromSlug(slug: string): string {
  const words = slug.toLowerCase().split(/[-_\s]+/).filter(Boolean);
  let prefix = "";
  if (words.length === 0) return "";
  if (words.length === 1) {
    prefix = (words[0] ?? "").replace(/[^a-z0-9]/g, "").slice(0, 4);
  } else {
    prefix = words
      .slice(0, 4)
      .map((w) => w.replace(/[^a-z0-9]/g, "").charAt(0))
      .filter(Boolean)
      .join("");
  }
  return prefix.toUpperCase();
}

watch(
  () => form.slug,
  (newSlug, oldSlug) => {
    const previousAuto = derivePrefixFromSlug(oldSlug ?? "");
    if (!form.keyPrefix || form.keyPrefix === previousAuto) {
      form.keyPrefix = derivePrefixFromSlug(newSlug);
    }
  },
);

async function submit() {
  const body: Record<string, string> = {
    name: form.name,
    slug: form.slug,
  };
  if (form.description) body.description = form.description;
  if (form.keyPrefix) body.keyPrefix = form.keyPrefix;
  await api("/projects", { method: "POST", body });
  open.value = false;
  form.name = "";
  form.slug = "";
  form.description = "";
  form.keyPrefix = "";
  await store.loadProjects();
}

function selectProject(slug: string) {
  store.setCurrent(slug);
}
</script>

<template>
  <UDashboardPanel id="projects">
    <template #header>
      <UDashboardNavbar title="Projects">
        <template #right>
          <UButton
            icon="i-lucide-plus"
            color="primary"
            label="New project"
            @click="open = true"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="!projects.length" class="text-center text-muted py-12">
        No projects yet. Create one to start.
      </div>
      <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <UCard
          v-for="p in projects"
          :key="p.id"
          :class="
            p.slug === currentProject?.slug
              ? 'ring-2 ring-primary cursor-pointer transition'
              : 'cursor-pointer hover:ring-1 hover:ring-default transition'
          "
          @click="selectProject(p.slug)"
        >
          <template #header>
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium truncate">{{ p.name }}</span>
              <UBadge variant="soft" size="sm">{{ p.keyPrefix }}</UBadge>
            </div>
          </template>
          <p class="text-sm text-muted">
            {{ p.description ?? "no description" }}
          </p>
          <p class="text-xs text-muted/60 font-mono mt-2">{{ p.slug }}</p>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>

  <UModal v-model:open="open" title="Create project">
    <template #body>
      <div class="space-y-4">
        <UFormField label="Name">
          <UInput v-model="form.name" />
        </UFormField>
        <UFormField label="Slug" hint="lowercase, hyphens">
          <UInput v-model="form.slug" />
        </UFormField>
        <UFormField
          label="Key prefix"
          hint="Used in card keys (e.g. CO-1). Auto-derived from slug; edit if you want."
        >
          <UInput v-model="form.keyPrefix" placeholder="CO" />
        </UFormField>
        <UFormField label="Description">
          <UTextarea v-model="form.description" :rows="3" />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton variant="ghost" label="Cancel" @click="open = false" />
        <UButton color="primary" label="Create" @click="submit" />
      </div>
    </template>
  </UModal>
</template>
