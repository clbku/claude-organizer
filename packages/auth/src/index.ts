import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'

import { createId, type Database, idPrefixes } from '@claude-organizer/db'
import {
  accounts,
  sessions,
  users,
  verifications
} from '@claude-organizer/db/schema'

export function isGithubConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
  )
}

// E-mail+password is the zero-config base method (see ADR). Kept as a function
// so the capabilities endpoint and the auth instance read the same source once
// the sem-auth toggle (T2.5) makes it conditional.
export function isEmailPasswordEnabled(): boolean {
  return true
}

// The web runs on a different origin (:4401) than the API (:4400) where
// better-auth lives, so its origin must be trusted or better-auth's CSRF check
// rejects sign-in/sign-up. The API reuses this list for its CORS allow-list.
export function getTrustedOrigins(): string[] {
  const raw = process.env.AUTH_TRUSTED_ORIGINS
  if (raw) return raw.split(',').map(o => o.trim()).filter(Boolean)
  return ['http://127.0.0.1:4401']
}

export async function hasAnyUser(db: Database): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).limit(1)
  return Boolean(row)
}

export function createAuth(db: Database) {
  return betterAuth({
    appName: 'Claude Organizer',
    database: drizzleAdapter(db, {
      provider: 'pg',
      usePlural: true,
      schema: { users, sessions, accounts, verifications }
    }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    trustedOrigins: getTrustedOrigins(),
    emailAndPassword: { enabled: isEmailPasswordEnabled() },
    // Empty object = no social provider registered, so GitHub is truly absent
    // (not just hidden) when the host didn't configure it.
    socialProviders: isGithubConfigured()
      ? {
          github: {
            clientId: process.env.GITHUB_CLIENT_ID!,
            clientSecret: process.env.GITHUB_CLIENT_SECRET!
          }
        }
      : {},
    advanced: {
      database: {
        // better-auth model names (user/session/account/verification) match the
        // keys in db's idPrefixes, so the prefix map isn't duplicated here.
        generateId: ({ model }) => {
          const prefix = idPrefixes[model as keyof typeof idPrefixes]
          return prefix ? createId(prefix) : false
        }
      }
    }
  })
}

export type Auth = ReturnType<typeof createAuth>
