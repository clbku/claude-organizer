import { createId, type Database } from '@claude-organizer/db'
import {
  accounts,
  sessions,
  users,
  verifications
} from '@claude-organizer/db/schema'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'

// better-auth model name → project id prefix (see packages/db ids.ts).
const modelPrefixes = {
  user: 'usr',
  session: 'ses',
  account: 'acc',
  verification: 'ver'
} as const

export function isGithubConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
  )
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
    emailAndPassword: { enabled: true },
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
        generateId: ({ model }) => {
          const prefix = modelPrefixes[model as keyof typeof modelPrefixes]
          return prefix ? createId(prefix) : false
        }
      }
    }
  })
}

export type Auth = ReturnType<typeof createAuth>
