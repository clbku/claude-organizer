<script setup lang="ts">
import { useProjectStore } from '~/stores/project'

const props = defineProps<{
  value: string | null | undefined
}>()

const store = useProjectStore()
const router = useRouter()

const html = computed(() =>
  linkifyKeys(props.value ?? '', store.currentProject?.keyPrefix ?? null)
)

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
  <!-- eslint-disable-next-line vue/no-v-html -- inline markdown rendered from trusted card content -->
  <span @click="onClick" v-html="html" />
</template>
