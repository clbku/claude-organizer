import type { AuthCapabilities, SessionUser } from '@claude-organizer/shared'

export function useAuth() {
  const api = useApi()
  const user = useState<SessionUser | null>('auth.user', () => null)
  const loaded = useState('auth.loaded', () => false)

  async function fetchSession() {
    user.value = await api<SessionUser | null>('/auth/me')
    loaded.value = true
    return user.value
  }

  // Cached for the app's lifetime; a hard reload resets useState and refetches.
  async function ensureSession() {
    if (!loaded.value) await fetchSession()
    return user.value
  }

  function fetchCapabilities() {
    return api<AuthCapabilities>('/auth/capabilities')
  }

  async function signUpEmail(input: {
    name: string
    email: string
    password: string
  }) {
    await api('/api/auth/sign-up/email', { method: 'POST', body: input })
    await fetchSession()
  }

  async function signInEmail(input: { email: string, password: string }) {
    await api('/api/auth/sign-in/email', { method: 'POST', body: input })
    await fetchSession()
  }

  async function signInGithub() {
    const { url } = await api<{ url: string }>('/api/auth/sign-in/social', {
      method: 'POST',
      body: { provider: 'github', callbackURL: `${window.location.origin}/` }
    })
    if (!url) throw new Error('GitHub indisponível no momento')
    window.location.href = url
  }

  async function signOut() {
    await api('/api/auth/sign-out', { method: 'POST' })
    user.value = null
  }

  return {
    user,
    ensureSession,
    fetchSession,
    fetchCapabilities,
    signUpEmail,
    signInEmail,
    signInGithub,
    signOut
  }
}
