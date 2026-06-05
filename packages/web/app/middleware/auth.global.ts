export default defineNuxtRouteMiddleware(async (to) => {
  const { user, ensureSession } = useAuth()
  await ensureSession()

  if (!user.value && to.path !== '/login') return navigateTo('/login')
  if (user.value && to.path === '/login') return navigateTo('/')
})
