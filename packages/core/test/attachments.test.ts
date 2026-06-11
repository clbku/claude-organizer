import { describe, expect, it } from 'vitest'

import {
  createAttachment,
  createCard,
  deleteAttachment,
  getAttachment,
  listAttachments,
  updateCard
} from '../src/index'
import { freshProject, useTestDb } from './helpers'

const ctx = useTestDb()

const png = (size = 16) => Buffer.alloc(size, 7)

const image = (projectId: string) =>
  createAttachment(ctx.db, {
    projectId,
    mime: 'image/png',
    data: png(),
    width: 1,
    height: 1
  })

describe('attachments CRUD', () => {
  it('creates an attachment and reads its metadata + bytes back', async () => {
    const project = await freshProject(ctx.db)
    const bytes = png(32)
    const created = await createAttachment(ctx.db, {
      projectId: project.id,
      mime: 'image/webp',
      data: bytes,
      width: 100,
      height: 80,
      filename: 'shot.webp',
      description: 'a screenshot'
    })

    expect(created.id).toMatch(/^att_/)
    expect(created.byteSize).toBe(bytes.length)
    expect(created).not.toHaveProperty('data')

    const fetched = await getAttachment(ctx.db, created.id)
    expect(fetched?.data).toEqual(bytes)
    expect(fetched?.mime).toBe('image/webp')
    expect(fetched?.description).toBe('a screenshot')
  })

  it('derives byteSize from the actual bytes', async () => {
    const project = await freshProject(ctx.db)
    const created = await createAttachment(ctx.db, {
      projectId: project.id,
      mime: 'image/png',
      data: png(64),
      width: 10,
      height: 10
    })
    expect(created.byteSize).toBe(64)
  })

  it('lists every attachment of a project', async () => {
    const project = await freshProject(ctx.db)
    const a = await image(project.id)
    const b = await image(project.id)

    const all = await listAttachments(ctx.db, { projectId: project.id })
    expect(all.map(x => x.id).sort()).toEqual([a.id, b.id].sort())
  })

  it('deletes an attachment', async () => {
    const project = await freshProject(ctx.db)
    const created = await createAttachment(ctx.db, {
      projectId: project.id,
      mime: 'image/gif',
      data: png(),
      width: 1,
      height: 1
    })
    const deleted = await deleteAttachment(ctx.db, created.id)
    expect(deleted?.id).toBe(created.id)
    expect(await getAttachment(ctx.db, created.id)).toBeNull()
  })

  it('rejects a mime outside the allow-list', async () => {
    const project = await freshProject(ctx.db)
    await expect(
      createAttachment(ctx.db, {
        projectId: project.id,
        mime: 'application/pdf' as never,
        data: png(),
        width: 1,
        height: 1
      })
    ).rejects.toThrow()
  })
})

describe('upload is born orphan (links-only model)', () => {
  it('arms orphaned_at on create so an abandoned upload is sweepable later', async () => {
    const project = await freshProject(ctx.db)
    const att = await image(project.id)
    const row = await getAttachment(ctx.db, att.id)
    expect(row?.orphanedAt).not.toBeNull()
  })

  it('clears orphaned_at once a saved body references it (link created)', async () => {
    const project = await freshProject(ctx.db)
    const card = await createCard(ctx.db, { projectId: project.id, title: 'C' })
    const att = await image(project.id)

    await updateCard(ctx.db, {
      id: card.id,
      descriptionMd: `see ![p](/attachments/${att.id})`
    })

    const row = await getAttachment(ctx.db, att.id)
    expect(row?.orphanedAt).toBeNull()
  })
})
