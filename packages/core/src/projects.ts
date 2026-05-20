import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { createId, type Database, schema } from '@claude-organizer/db'

import { InputError } from './errors'
import { derivePrefixFromSlug, isValidKeyPrefix } from './keys'

export const createProjectInput = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase letters, digits and hyphens only'),
  description: z.string().max(2000).optional(),
  keyPrefix: z
    .string()
    .min(1)
    .max(10)
    .regex(/^[A-Z][A-Z0-9]{0,9}$/, 'uppercase letters and digits, starting with a letter')
    .optional()
})
export type CreateProjectInput = z.infer<typeof createProjectInput>

export async function createProject(db: Database, input: CreateProjectInput) {
  const parsed = createProjectInput.parse(input)
  const keyPrefix = parsed.keyPrefix ?? derivePrefixFromSlug(parsed.slug)
  const [row] = await db
    .insert(schema.projects)
    .values({
      id: createId('prj'),
      name: parsed.name,
      slug: parsed.slug,
      description: parsed.description,
      keyPrefix,
      nextKeySeq: 1
    })
    .returning()
  return row
}

export async function listProjects(db: Database) {
  return db.select().from(schema.projects).orderBy(schema.projects.createdAt)
}

export async function getProjectBySlug(db: Database, slug: string) {
  const [row] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.slug, slug))
    .limit(1)
  return row ?? null
}

export async function getProjectById(db: Database, id: string) {
  const [row] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .limit(1)
  return row ?? null
}

export async function updateProjectKeyPrefix(
  db: Database,
  projectId: string,
  newPrefix: string
) {
  if (!isValidKeyPrefix(newPrefix)) {
    throw new InputError(
      'Invalid keyPrefix. Use uppercase letters/digits, starting with a letter, max 10 chars.'
    )
  }
  const [row] = await db
    .update(schema.projects)
    .set({ keyPrefix: newPrefix, updatedAt: sql`now()` })
    .where(eq(schema.projects.id, projectId))
    .returning()
  return row ?? null
}
