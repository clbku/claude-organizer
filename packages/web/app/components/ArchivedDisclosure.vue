<script setup lang="ts">
// Collapsible section, closed by default. Hidden entirely when the count is 0
// (nothing to reveal). Body goes in the default slot.
withDefaults(defineProps<{ count: number, label?: string, icon?: string }>(), {
  label: 'Archived',
  icon: 'i-lucide-archive'
})

const open = ref(false)
</script>

<template>
  <section v-if="count">
    <button
      type="button"
      class="flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wide hover:text-default transition"
      @click="open = !open"
    >
      <UIcon
        :name="open ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
        class="size-4 shrink-0"
      />
      <UIcon :name="icon" class="size-4 shrink-0" />
      {{ label }}
      <span class="text-default">({{ count }})</span>
    </button>
    <div v-if="open" class="mt-3">
      <slot />
    </div>
  </section>
</template>
