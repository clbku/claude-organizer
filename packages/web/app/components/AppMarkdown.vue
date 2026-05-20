<script setup lang="ts">
import { useProjectStore } from '~/stores/project'

const props = defineProps<{
  value: string | null | undefined
}>()

const store = useProjectStore()
const router = useRouter()

const html = computed(() => {
  if (!props.value) return ''
  return renderCardMarkdown(props.value, store.currentProject?.keyPrefix ?? null)
})

// Make internal links (e.g. the auto-linked card keys) navigate via the router
// instead of doing a full page reload. External links keep default behavior.
function onClick(e: MouseEvent) {
  const anchor = (e.target as HTMLElement).closest('a')
  if (!anchor) return
  const href = anchor.getAttribute('href')
  if (href && href.startsWith('/')) {
    e.preventDefault()
    router.push(href)
  }
}
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- markdown rendered from trusted card/doc content via marked -->
  <div @click="onClick" v-html="html" />
</template>
