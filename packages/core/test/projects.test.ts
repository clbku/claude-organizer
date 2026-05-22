import { describe, expect, it } from 'vitest'

import {
  archiveProject,
  createCard,
  createSprint,
  destroyProject,
  getCard,
  getProjectById,
  listProjects,
  restoreProject
} from '../src/index'
import { freshProject, useTestDb } from './helpers'

const ctx = useTestDb()

const has = (list: { id: string }[], id: string) =>
  list.some(p => p.id === id)

describe('archiving projects', () => {
  it('hides an archived project from the default list; archivedOnly/includeArchived reveal it', async () => {
    const project = await freshProject(ctx.db)
    expect(has(await listProjects(ctx.db), project.id)).toBe(true)

    await archiveProject(ctx.db, project.id)
    expect(has(await listProjects(ctx.db), project.id)).toBe(false)
    expect(
      has(await listProjects(ctx.db, { archivedOnly: true }), project.id)
    ).toBe(true)
    expect(
      has(await listProjects(ctx.db, { includeArchived: true }), project.id)
    ).toBe(true)
  })

  it('restores an archived project back into the default list', async () => {
    const project = await freshProject(ctx.db)
    await archiveProject(ctx.db, project.id)
    await restoreProject(ctx.db, project.id)
    expect(has(await listProjects(ctx.db), project.id)).toBe(true)
  })
})

describe('destroying projects', () => {
  it('refuses to destroy with a non-matching slug and deletes nothing', async () => {
    const project = await freshProject(ctx.db)
    await expect(
      destroyProject(ctx.db, project.id, 'definitely-wrong')
    ).rejects.toThrow()
    expect(await getProjectById(ctx.db, project.id)).not.toBeNull()
  })

  it('destroys the project and cascades to its cards when the slug matches', async () => {
    const project = await freshProject(ctx.db)
    const sprint = await createSprint(ctx.db, {
      projectId: project.id,
      name: 'S'
    })
    const card = await createCard(ctx.db, {
      projectId: project.id,
      sprintId: sprint.id,
      title: 'doomed'
    })

    const result = await destroyProject(ctx.db, project.id, project.slug)
    expect(result?.id).toBe(project.id)
    expect(await getProjectById(ctx.db, project.id)).toBeNull()
    expect(await getCard(ctx.db, card.id)).toBeNull()
  })
})
