// Page guard for admin-only screens. Runs after the global auth middleware, so
// the session and capabilities are already resolved. Sem-auth mode has no roles,
// so the admin queue is moot there too.
export default defineNuxtRouteMiddleware(() => {
  const { user, capabilities } = useAuth()
  if (capabilities.value && !capabilities.value.authEnabled) {
    return navigateTo('/')
  }
  if (user.value?.role !== 'admin') return navigateTo('/')
})
