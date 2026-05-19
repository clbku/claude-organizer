export function useApi() {
  const config = useRuntimeConfig();
  const baseURL = config.public.apiUrl;
  return $fetch.create({ baseURL });
}
