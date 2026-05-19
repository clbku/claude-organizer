import { useProjectStore } from "~/stores/project";

export default defineNuxtPlugin(async () => {
  const store = useProjectStore();
  await store.ensureLoaded();
});
