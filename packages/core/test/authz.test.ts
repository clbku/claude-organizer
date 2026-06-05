import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { schema } from '@claude-organizer/db'

import { claimOrCreateUserAuthz, getUserAuthz } from '../src/index'
import { useTestDb } from './helpers'

const ctx = useTestDb()

// This is the only suite that touches users/user_authz, so wiping users (which
// cascades to user_authz) between cases is safe even with the shared ephemeral
// Postgres — no other test file writes these tables.
beforeEach(async () => {
  await ctx.db.delete(schema.users)
})

async function makeUser(db: typeof ctx.db) {
  const id = `usr_${randomUUID().replace(/-/g, '').slice(0, 16)}`
  await db.insert(schema.users).values({ id, name: 'T', email: `${id}@t.test` })
  return id
}

describe('claimOrCreateUserAuthz', () => {
  it('claims the first user as admin/approved/all-projects, rest pending', async () => {
    const u1 = await makeUser(ctx.db)
    expect(await claimOrCreateUserAuthz(ctx.db, u1)).toBe(true)
    expect(await getUserAuthz(ctx.db, u1)).toMatchObject({
      role: 'admin',
      status: 'approved',
      allProjects: true
    })

    const u2 = await makeUser(ctx.db)
    expect(await claimOrCreateUserAuthz(ctx.db, u2)).toBe(false)
    expect(await getUserAuthz(ctx.db, u2)).toMatchObject({
      role: 'user',
      status: 'pending',
      allProjects: false
    })
  })

  it('is idempotent when the hook runs twice for the same user', async () => {
    const u1 = await makeUser(ctx.db)
    expect(await claimOrCreateUserAuthz(ctx.db, u1)).toBe(true)
    expect(await claimOrCreateUserAuthz(ctx.db, u1)).toBe(false)
    expect(await getUserAuthz(ctx.db, u1)).toMatchObject({ role: 'admin' })
  })

  it('serializes concurrent first logins down to a single admin', async () => {
    const u1 = await makeUser(ctx.db)
    const u2 = await makeUser(ctx.db)
    const results = await Promise.all([
      claimOrCreateUserAuthz(ctx.db, u1),
      claimOrCreateUserAuthz(ctx.db, u2)
    ])
    expect(results.filter(Boolean)).toHaveLength(1)
    const admins = await ctx.db
      .select()
      .from(schema.userAuthz)
      .where(eq(schema.userAuthz.role, 'admin'))
    expect(admins).toHaveLength(1)
  })
})
