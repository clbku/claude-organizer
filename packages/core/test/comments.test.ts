import { describe, expect, it } from 'vitest'

import {
  addComment,
  createCard,
  listComments,
  listUnreadCommentsForProject,
  markCommentsAsRead
} from '../src/index'
import { freshProject, useTestDb } from './helpers'

const ctx = useTestDb()

describe('comment read tracking by AI', () => {
  it('a user comment starts unread and shows up in the project\'s unread list', async () => {
    const project = await freshProject(ctx.db)
    const card = await createCard(ctx.db, { projectId: project.id, title: 'c' })

    const comment = await addComment(ctx.db, {
      cardId: card.id,
      author: 'user',
      bodyMd: 'please check this'
    })
    expect(comment.readByAi).toBe(false)

    const unread = await listUnreadCommentsForProject(ctx.db, project.id)
    expect(unread.map(u => u.id)).toContain(comment.id)
  })

  it('listComments with markAsRead clears the unread flag for user comments', async () => {
    const project = await freshProject(ctx.db)
    const card = await createCard(ctx.db, { projectId: project.id, title: 'c' })
    await addComment(ctx.db, {
      cardId: card.id,
      author: 'user',
      bodyMd: 'first'
    })

    await listComments(ctx.db, card.id, { markAsRead: true })

    const unread = await listUnreadCommentsForProject(ctx.db, project.id)
    expect(unread).toHaveLength(0)
  })

  it('AI-authored comments are never counted as unread-by-AI', async () => {
    const project = await freshProject(ctx.db)
    const card = await createCard(ctx.db, { projectId: project.id, title: 'c' })
    await addComment(ctx.db, {
      cardId: card.id,
      author: 'ai',
      bodyMd: 'progress note'
    })

    const unread = await listUnreadCommentsForProject(ctx.db, project.id)
    expect(unread).toHaveLength(0)
  })

  it('markCommentsAsRead marks the given comments and returns the count', async () => {
    const project = await freshProject(ctx.db)
    const card = await createCard(ctx.db, { projectId: project.id, title: 'c' })
    const c1 = await addComment(ctx.db, {
      cardId: card.id,
      author: 'user',
      bodyMd: 'one'
    })
    const c2 = await addComment(ctx.db, {
      cardId: card.id,
      author: 'user',
      bodyMd: 'two'
    })

    const count = await markCommentsAsRead(ctx.db, [c1.id, c2.id])
    expect(count).toBe(2)
    expect(await listUnreadCommentsForProject(ctx.db, project.id)).toHaveLength(0)
  })
})
