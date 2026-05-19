<script setup lang="ts">
import { marked } from "marked";

const props = defineProps<{
  value: string | null | undefined;
}>();

marked.setOptions({ breaks: true, gfm: true });

const html = computed(() => {
  if (!props.value) return "";
  return marked.parse(props.value, { async: false }) as string;
});
</script>

<template>
  <div v-html="html" />
</template>
