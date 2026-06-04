import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { createId, type Database, schema } from '@claude-organizer/db'
import { INTAKE_STATUSES, type IntakeStatus } from '@claude-organizer/shared'

import { notify } from './events'

export const createIntakeItemInput = z.object({
  projectId: z.string(),
  bodyMd: z.string().min(1)
})
export type CreateIntakeItemInput = z.infer<typeof createIntakeItemInput>

export const updateIntakeItemInput = z.object({
  id: z.string(),
  bodyMd: z.string().min(1)
})
export type UpdateIntakeItemInput = z.infer<typeof updateIntakeItemInput>

export const intakeStatus = z.enum(INTAKE_STATUSES)

async function notifyChanged(db: Database, row: { id: string, projectId: string }) {
  await notify(db, {
    type: 'inbox.changed',
    projectId: row.projectId,
    intakeId: row.id
  })
}

export async function listIntakeItems(
  db: Database,
  projectId: string,
  options: { status?: IntakeStatus } = {}
) {
  const conditions = [eq(schema.intakeItems.projectId, projectId)]
  if (options.status) {
    conditions.push(eq(schema.intakeItems.status, options.status))
  }
  return db
    .select()
    .from(schema.intakeItems)
    .where(and(...conditions))
    .orderBy(desc(schema.intakeItems.createdAt))
}

export async function createIntakeItem(db: Database, input: CreateIntakeItemInput) {
  const parsed = createIntakeItemInput.parse(input)
  const [row] = await db
    .insert(schema.intakeItems)
    .values({
      id: createId('itk'),
      projectId: parsed.projectId,
      bodyMd: parsed.bodyMd
    })
    .returning()
  if (row) await notifyChanged(db, row)
  return row
}

export async function updateIntakeItem(db: Database, input: UpdateIntakeItemInput) {
  const parsed = updateIntakeItemInput.parse(input)
  const [row] = await db
    .update(schema.intakeItems)
    .set({ bodyMd: parsed.bodyMd, updatedAt: sql`now()` })
    .where(eq(schema.intakeItems.id, parsed.id))
    .returning()
  if (row) await notifyChanged(db, row)
  return row ?? null
}

export async function markIntakePlanned(
  db: Database,
  id: string,
  cardKeys: string[]
) {
  const keys = cardKeys.filter(Boolean).join(',')
  const [row] = await db
    .update(schema.intakeItems)
    .set({
      status: 'planned',
      plannedCardKeys: keys || null,
      updatedAt: sql`now()`
    })
    .where(eq(schema.intakeItems.id, id))
    .returning()
  if (row) await notifyChanged(db, row)
  return row ?? null
}

export async function archiveIntakeItem(db: Database, id: string) {
  const [row] = await db
    .update(schema.intakeItems)
    .set({ status: 'archived', archivedAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(schema.intakeItems.id, id))
    .returning()
  if (row) await notifyChanged(db, row)
  return row ?? null
}

export async function restoreIntakeItem(db: Database, id: string) {
  const [current] = await db
    .select()
    .from(schema.intakeItems)
    .where(eq(schema.intakeItems.id, id))
    .limit(1)
  if (!current) return null
  const nextStatus = current.plannedCardKeys ? 'planned' : 'pending'
  const [row] = await db
    .update(schema.intakeItems)
    .set({ status: nextStatus, archivedAt: null, updatedAt: sql`now()` })
    .where(eq(schema.intakeItems.id, id))
    .returning()
  if (row) await notifyChanged(db, row)
  return row ?? null
}

export async function destroyIntakeItem(db: Database, id: string) {
  const [row] = await db
    .delete(schema.intakeItems)
    .where(eq(schema.intakeItems.id, id))
    .returning()
  if (row) {
    await notify(db, {
      type: 'inbox.deleted',
      projectId: row.projectId,
      intakeId: row.id
    })
  }
  return row ?? null
}
