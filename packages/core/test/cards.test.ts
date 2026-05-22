import { describe, expect, it } from 'vitest'

import {
  createCard,
  createSprint,
  getCard,
  moveCardToBacklog,
  moveCardToSprint,
  reorderCards,
  updateCard
} from '../src/index'
import { freshProject, useTestDb } from './helpers'

const ctx = useTestDb()

describe('card key generation', () => {
  it('assigns sequential keys per project prefix', async () => {
    const project = await freshProject(ctx.db, 'CO')
    const a = await createCard(ctx.db, { projectId: project.id, title: 'first' })
    const b = await createCard(ctx.db, { projectId: project.id, title: 'second' })
    expect(a.key).toBe('CO-1')
    expect(b.key).toBe('CO-2')
  })

  it('is atomic under concurrency: no duplicates, contiguous sequence', async () => {
    const project = await freshProject(ctx.db, 'AT')
    const n = 25
    const cards = await Promise.all(
      Array.from({ length: n }, (_, i) =>
        createCard(ctx.db, { projectId: project.id, title: `c${i}` })
      )
    )
    const nums = cards
      .map(c => Number(c.key.split('-')[1]))
      .sort((x, y) => x - y)
    expect(new Set(cards.map(c => c.key)).size).toBe(n)
    expect(nums).toEqual(Array.from({ length: n }, (_, i) => i + 1))
  })

  it('keeps a separate sequence per project', async () => {
    const p1 = await freshProject(ctx.db, 'AA')
    const p2 = await freshProject(ctx.db, 'BB')
    const c1 = await createCard(ctx.db, { projectId: p1.id, title: 'x' })
    const c2 = await createCard(ctx.db, { projectId: p2.id, title: 'y' })
    expect(c1.key).toBe('AA-1')
    expect(c2.key).toBe('BB-1')
  })
})

describe('moving cards between backlog and sprint', () => {
  it('moves a backlog card into a sprint and back', async () => {
    const project = await freshProject(ctx.db)
    const sprint = await createSprint(ctx.db, {
      projectId: project.id,
      name: 'S1'
    })
    const card = await createCard(ctx.db, {
      projectId: project.id,
      title: 'movable'
    })
    expect(card.sprintId).toBeNull()

    const moved = await moveCardToSprint(ctx.db, card.id, sprint.id)
    expect(moved?.sprintId).toBe(sprint.id)

    const back = await moveCardToBacklog(ctx.db, card.id)
    expect(back?.sprintId).toBeNull()
  })

  it('changes status', async () => {
    const project = await freshProject(ctx.db)
    const card = await createCard(ctx.db, {
      projectId: project.id,
      title: 'status'
    })

    await updateCard(ctx.db, { id: card.id, status: 'in_progress' })
    const reloaded = await getCard(ctx.db, card.id)
    expect(reloaded?.status).toBe('in_progress')
  })
})

describe('default status by sprint membership', () => {
  it('a card with no sprint lands in the backlog status', async () => {
    const project = await freshProject(ctx.db)
    const card = await createCard(ctx.db, {
      projectId: project.id,
      title: 'parked'
    })
    expect(card.sprintId).toBeNull()
    expect(card.status).toBe('backlog')
  })

  it('a card created straight into a sprint starts in todo', async () => {
    const project = await freshProject(ctx.db)
    const sprint = await createSprint(ctx.db, {
      projectId: project.id,
      name: 'S'
    })
    const card = await createCard(ctx.db, {
      projectId: project.id,
      sprintId: sprint.id,
      title: 'committed'
    })
    expect(card.status).toBe('todo')
  })

  it('an explicit status always wins over the default', async () => {
    const project = await freshProject(ctx.db)
    const card = await createCard(ctx.db, {
      projectId: project.id,
      title: 'explicit',
      status: 'in_progress'
    })
    expect(card.status).toBe('in_progress')
  })

  it('moves backlog -> todo and back without a sprint', async () => {
    const project = await freshProject(ctx.db)
    const card = await createCard(ctx.db, {
      projectId: project.id,
      title: 'promote'
    })
    expect(card.status).toBe('backlog')

    const promoted = await updateCard(ctx.db, { id: card.id, status: 'todo' })
    expect(promoted?.status).toBe('todo')
    expect(promoted?.sprintId).toBeNull()

    const back = await updateCard(ctx.db, { id: card.id, status: 'backlog' })
    expect(back?.status).toBe('backlog')
    expect(back?.sprintId).toBeNull()
  })
})

describe('reordering cards', () => {
  it('persists position from the given order', async () => {
    const project = await freshProject(ctx.db)
    const a = await createCard(ctx.db, { projectId: project.id, title: 'a' })
    const b = await createCard(ctx.db, { projectId: project.id, title: 'b' })
    const c = await createCard(ctx.db, { projectId: project.id, title: 'c' })

    await reorderCards(ctx.db, { orderedIds: [c.id, a.id, b.id] })

    expect((await getCard(ctx.db, c.id))?.position).toBe(0)
    expect((await getCard(ctx.db, a.id))?.position).toBe(1)
    expect((await getCard(ctx.db, b.id))?.position).toBe(2)
  })

  it('applies a moved card status and sprint within the reorder', async () => {
    const project = await freshProject(ctx.db)
    const sprint = await createSprint(ctx.db, {
      projectId: project.id,
      name: 'S'
    })
    const card = await createCard(ctx.db, { projectId: project.id, title: 'x' })
    expect(card.status).toBe('backlog')

    await reorderCards(ctx.db, {
      orderedIds: [card.id],
      moved: { id: card.id, status: 'todo', sprintId: sprint.id }
    })

    const reloaded = await getCard(ctx.db, card.id)
    expect(reloaded?.status).toBe('todo')
    expect(reloaded?.sprintId).toBe(sprint.id)
    expect(reloaded?.position).toBe(0)
  })
})
