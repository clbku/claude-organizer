<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";

// Kebab menu with Archive (soft-delete) + Destroy (hard-delete), each behind a
// confirmation modal. The parent owns what happens after success (navigate /
// clear selection / reload), so this only performs the API call and emits.
const props = withDefaults(
  defineProps<{
    kind: "card" | "sprint" | "doc";
    entityId: string;
    entityLabel: string;
    /** How many children get hard-deleted along with this entity (cascade). */
    cascadeCount?: number;
    /** Singular noun for the cascade children, e.g. "card", "sub-task". */
    cascadeNoun?: string;
    cascadeNounPlural?: string;
    size?: "xs" | "sm" | "md";
  }>(),
  { cascadeCount: 0, cascadeNoun: "item", size: "sm" },
);

const emit = defineEmits<{ archived: []; destroyed: [] }>();

const api = useApi();

const KIND_LABEL = { card: "card", sprint: "sprint", doc: "doc" } as const;
// card → /cards, sprint → /sprints, doc → /docs
const basePath = computed(() => `/${props.kind}s`);

const archiveOpen = ref(false);
const destroyOpen = ref(false);
const archiving = ref(false);
const destroying = ref(false);

const items = computed<DropdownMenuItem[]>(() => [
  {
    label: "Arquivar",
    icon: "i-lucide-archive",
    onSelect: () => {
      archiveOpen.value = true;
    },
  },
  {
    label: "Destruir",
    icon: "i-lucide-trash-2",
    color: "error",
    onSelect: () => {
      destroyOpen.value = true;
    },
  },
]);

const cascadeText = computed(() => {
  const n = props.cascadeCount;
  if (!n) return "";
  const noun =
    n === 1 ? props.cascadeNoun : (props.cascadeNounPlural ?? `${props.cascadeNoun}s`);
  return ` e ${n} ${noun}`;
});

async function confirmArchive() {
  archiving.value = true;
  try {
    await api(`${basePath.value}/${props.entityId}/archive`, { method: "POST" });
    archiveOpen.value = false;
    emit("archived");
  } finally {
    archiving.value = false;
  }
}

async function confirmDestroy() {
  destroying.value = true;
  try {
    await api(`${basePath.value}/${props.entityId}`, { method: "DELETE" });
    destroyOpen.value = false;
    emit("destroyed");
  } finally {
    destroying.value = false;
  }
}
</script>

<template>
  <UDropdownMenu :items="items" :modal="false" :content="{ align: 'end' }">
    <UButton
      icon="i-lucide-ellipsis-vertical"
      color="neutral"
      variant="ghost"
      :size="size"
      aria-label="Mais ações"
    />
  </UDropdownMenu>

  <UModal v-model:open="archiveOpen" :title="`Arquivar ${KIND_LABEL[kind]}?`">
    <template #body>
      <p class="text-sm text-muted">
        <span class="font-medium text-default">{{ entityLabel }}</span>
        some das visões, mas você pode restaurar depois.
      </p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton variant="ghost" label="Cancelar" @click="archiveOpen = false" />
        <UButton
          color="primary"
          icon="i-lucide-archive"
          label="Arquivar"
          :loading="archiving"
          @click="confirmArchive"
        />
      </div>
    </template>
  </UModal>

  <UModal v-model:open="destroyOpen" :title="`Destruir ${KIND_LABEL[kind]}?`">
    <template #body>
      <p class="text-sm text-muted">
        Isto vai apagar
        <span class="font-medium text-default">{{ entityLabel }}</span
        >{{ cascadeText }}.
        <strong class="text-error">Não dá pra desfazer.</strong>
      </p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton variant="ghost" label="Cancelar" @click="destroyOpen = false" />
        <UButton
          color="error"
          icon="i-lucide-trash-2"
          label="Destruir"
          :loading="destroying"
          @click="confirmDestroy"
        />
      </div>
    </template>
  </UModal>
</template>
