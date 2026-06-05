export function useApi() {
  const config = useRuntimeConfig()
  const baseURL = config.public.apiUrl
  // `credentials: 'include'` so the better-auth session cookie travels on the
  // cross-origin requests to the API.
  return $fetch.create({ baseURL, credentials: 'include' })
}
