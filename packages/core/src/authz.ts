import { and, eq, sql } from 'drizzle-orm'

import { type Database, schema } from '@claude-organizer/db'
import { SYSTEM_SETTINGS_ID } from '@claude-organizer/db/schema'
import type { SystemSettingsRow, UserRole } from '@claude-organizer/shared'

export async function getUserAuthz(db: Database, userId: string) {
  const [row] = await db
    .select()
    .from(schema.userAuthz)
    .where(eq(schema.userAuthz.userId, userId))
    .limit(1)
  return row ?? null
}

// Only approved users have any access. Admin and the `allProjects` flag short-
// circuit to every project (including ones created later); otherwise it is the
// explicit per-project grant.
export async function canAccessProject(
  db: Database,
  userId: string,
  projectId: string
): Promise<boolean> {
  const authz = await getUserAuthz(db, userId)
  if (!authz || authz.status !== 'approved') return false
  if (authz.role === 'admin' || authz.allProjects) return true
  const [row] = await db
    .select({ projectId: schema.userProjectAccess.projectId })
    .from(schema.userProjectAccess)
    .where(
      and(
        eq(schema.userProjectAccess.userId, userId),
        eq(schema.userProjectAccess.projectId, projectId)
      )
    )
    .limit(1)
  return Boolean(row)
}

// `'all'` means unrestricted (admin or allProjects flag) — callers skip project
// filtering. An empty array means a pending/unscoped user sees nothing.
export async function listAccessibleProjectIds(
  db: Database,
  userId: string
): Promise<'all' | string[]> {
  const authz = await getUserAuthz(db, userId)
  if (!authz || authz.status !== 'approved') return []
  if (authz.role === 'admin' || authz.allProjects) return 'all'
  const rows = await db
    .select({ projectId: schema.userProjectAccess.projectId })
    .from(schema.userProjectAccess)
    .where(eq(schema.userProjectAccess.userId, userId))
  return rows.map(r => r.projectId)
}

export interface SetUserAuthzInput {
  role: UserRole
  allProjects: boolean
  projectIds?: string[]
}

// Assigns role + project scope in one transaction and replaces the explicit
// grants wholesale. Upsert (not update) so it is self-sufficient — it must not
// depend on the create hook (CO-165) having inserted the row first; on insert
// `status` falls to its 'pending' default and is never touched on conflict, so
// the approval flow (CO-167) keeps ownership of pending→approved.
// `allProjects=true` clears the per-project rows so they never drift; admins are
// unrestricted regardless of what is stored here.
export async function setUserAuthz(
  db: Database,
  userId: string,
  input: SetUserAuthzInput
) {
  const projectIds
    = input.role === 'admin' || input.allProjects ? [] : (input.projectIds ?? [])
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.userAuthz)
      .values({
        userId,
        role: input.role,
        allProjects: input.allProjects
      })
      .onConflictDoUpdate({
        target: schema.userAuthz.userId,
        set: {
          role: input.role,
          allProjects: input.allProjects,
          updatedAt: sql`now()`
        }
      })
      .returning()
    await tx
      .delete(schema.userProjectAccess)
      .where(eq(schema.userProjectAccess.userId, userId))
    if (projectIds.length > 0) {
      await tx
        .insert(schema.userProjectAccess)
        .values(projectIds.map(projectId => ({ userId, projectId })))
    }
    return row!
  })
}

const DEFAULT_SYSTEM_SETTINGS = { authEnabled: true } as const

export async function getSystemSettings(
  db: Database
): Promise<Pick<SystemSettingsRow, 'authEnabled'>> {
  const [row] = await db
    .select({ authEnabled: schema.systemSettings.authEnabled })
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.id, SYSTEM_SETTINGS_ID))
    .limit(1)
  return row ?? DEFAULT_SYSTEM_SETTINGS
}

export async function setAuthEnabled(db: Database, authEnabled: boolean) {
  const [row] = await db
    .insert(schema.systemSettings)
    .values({ id: SYSTEM_SETTINGS_ID, authEnabled })
    .onConflictDoUpdate({
      target: schema.systemSettings.id,
      set: { authEnabled, updatedAt: sql`now()` }
    })
    .returning({ authEnabled: schema.systemSettings.authEnabled })
  return row!
}
