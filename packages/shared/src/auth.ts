// Minimal auth wire DTOs. The better-auth tables (user/session/account/
// verification) are NOT mirrored here or in conformance.ts — better-auth owns
// that shape. These are only the slices the web consumes. See ADR "Auth:
// e-mail+senha base + GitHub opcional".

export interface SessionUser {
  id: string
  name: string
  email: string
  image: string | null
}

export interface AuthCapabilities {
  emailPassword: boolean
  github: boolean
  hasUsers: boolean
}
