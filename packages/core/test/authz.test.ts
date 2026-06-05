import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { schema } from '@claude-organizer/db'

import {
  addComment,
  approveUser,
  canAccessProject,
  claimOrCreateUserAuthz,
  createCard,
  getUserAuthz,
  listAccessibleProjectIds,
  listPendingUsers,
  rejectUser,
  resolveCommentsProjectIds,
  resolveEntityProjectId,
  setUserAuthz
} from '../src/index'
import { freshProject, uniqueKeyPrefix, useTestDb } from './helpers'

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

describe('project access', () => {
  it('admin reaches every project; a pending user reaches none', async () => {
    const p = await freshProject(ctx.db)
    const admin = await makeUser(ctx.db)
    await claimOrCreateUserAuthz(ctx.db, admin)
    expect(await canAccessProject(ctx.db, admin, p.id)).toBe(true)
    expect(await listAccessibleProjectIds(ctx.db, admin)).toBe('all')

    const pending = await makeUser(ctx.db)
    await claimOrCreateUserAuthz(ctx.db, pending)
    expect(await canAccessProject(ctx.db, pending, p.id)).toBe(false)
    expect(await listAccessibleProjectIds(ctx.db, pending)).toEqual([])
  })

  it('a subset user is limited to granted projects; allProjects covers later ones', async () => {
    const p1 = await freshProject(ctx.db)
    const p2 = await freshProject(ctx.db)
    const admin = await makeUser(ctx.db)
    await claimOrCreateUserAuthz(ctx.db, admin)

    const u = await makeUser(ctx.db)
    await claimOrCreateUserAuthz(ctx.db, u)
    await approveUser(ctx.db, u, {
      role: 'user',
      allProjects: false,
      projectIds: [p1.id]
    })
    expect(await canAccessProject(ctx.db, u, p1.id)).toBe(true)
    expect(await canAccessProject(ctx.db, u, p2.id)).toBe(false)
    expect(await listAccessibleProjectIds(ctx.db, u)).toEqual([p1.id])

    await setUserAuthz(ctx.db, u, { role: 'user', allProjects: true })
    const p3 = await freshProject(ctx.db)
    expect(await canAccessProject(ctx.db, u, p3.id)).toBe(true)
    expect(await listAccessibleProjectIds(ctx.db, u)).toBe('all')
  })

  it('resolves an entity to its owning project (null when missing)', async () => {
    // Unique key prefix: card keys repeat across the default-'CO' projects other
    // test files create, so a by-key lookup must not collide (helper caveat).
    const p = await freshProject(ctx.db, uniqueKeyPrefix())
    const card = await createCard(ctx.db, { projectId: p.id, title: 'X' })
    expect(await resolveEntityProjectId(ctx.db, 'card', card.id)).toBe(p.id)
    expect(await resolveEntityProjectId(ctx.db, 'cardKey', card.key)).toBe(p.id)
    expect(await resolveEntityProjectId(ctx.db, 'card', 'missing')).toBeNull()
  })

  it('resolveCommentsProjectIds spans projects and is empty for no input', async () => {
    const p1 = await freshProject(ctx.db, uniqueKeyPrefix())
    const p2 = await freshProject(ctx.db, uniqueKeyPrefix())
    const c1 = await createCard(ctx.db, { projectId: p1.id, title: 'A' })
    const c2 = await createCard(ctx.db, { projectId: p2.id, title: 'B' })
    const cm1 = await addComment(ctx.db, {
      cardId: c1.id,
      author: 'user',
      bodyMd: 'x'
    })
    const cm2 = await addComment(ctx.db, {
      cardId: c2.id,
      author: 'user',
      bodyMd: 'y'
    })
    const ids = await resolveCommentsProjectIds(ctx.db, [cm1.id, cm2.id])
    expect([...ids].sort()).toEqual([p1.id, p2.id].sort())
    expect(await resolveCommentsProjectIds(ctx.db, [])).toEqual([])
  })
})

describe('approval queue', () => {
  it('lists pending users (not the admin) and approves with role+scope', async () => {
    const p = await freshProject(ctx.db)
    const admin = await makeUser(ctx.db)
    await claimOrCreateUserAuthz(ctx.db, admin)
    const u = await makeUser(ctx.db)
    await claimOrCreateUserAuthz(ctx.db, u)

    const ids = (await listPendingUsers(ctx.db)).map(x => x.id)
    expect(ids).toContain(u)
    expect(ids).not.toContain(admin)

    await approveUser(ctx.db, u, {
      role: 'user',
      allProjects: false,
      projectIds: [p.id]
    })
    expect(await getUserAuthz(ctx.db, u)).toMatchObject({
      status: 'approved',
      role: 'user',
      allProjects: false
    })
    expect(await canAccessProject(ctx.db, u, p.id)).toBe(true)
    expect((await listPendingUsers(ctx.db)).map(x => x.id)).not.toContain(u)
  })

  it('rejects a pending user by removing the account', async () => {
    const admin = await makeUser(ctx.db)
    await claimOrCreateUserAuthz(ctx.db, admin)
    const u = await makeUser(ctx.db)
    await claimOrCreateUserAuthz(ctx.db, u)

    expect(await rejectUser(ctx.db, u)).toMatchObject({ id: u })
    expect(await getUserAuthz(ctx.db, u)).toBeNull()
    expect((await listPendingUsers(ctx.db)).map(x => x.id)).not.toContain(u)
  })
})
