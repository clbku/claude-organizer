import { describe, expect, it } from 'vitest'

import {
  addComment,
  archiveSprint,
  createAttachment,
  createCard,
  createDoc,
  createIntakeItem,
  createSprint,
  destroyCard,
  destroyDoc,
  destroyIntakeItem,
  destroySprint,
  getAttachment,
  updateCard,
  updateComment,
  updateDoc,
  updateIntakeItem
} from '../src/index'
import { freshProject, useTestDb } from './helpers'

const ctx = useTestDb()

const bytes = () => Buffer.from('img', 'utf8')
const ref = (id: string) => `body ![pic](/attachments/${id}) more`

async function image(projectId: string) {
  return createAttachment(ctx.db, {
    projectId,
    mime: 'image/png',
    data: bytes(),
    width: 1,
    height: 1
  })
}

const exists = async (id: string) => (await getAttachment(ctx.db, id)) != null

describe('gcAttachmentsOnDestroy', () => {
  it('hard-deletes an owner-only card image when the card is destroyed', async () => {
    const project = await freshProject(ctx.db)
    const card = await createCard(ctx.db, { projectId: project.id, title: 'C' })
    const att = await image(project.id)
    await updateCard(ctx.db, { id: card.id, descriptionMd: ref(att.id) })

    await destroyCard(ctx.db, card.id)

    expect(await exists(att.id)).toBe(false)
  })

  it('keeps a shared image until the last referencing entity is destroyed', async () => {
    const project = await freshProject(ctx.db)
    const cardA = await createCard(ctx.db, { projectId: project.id, title: 'A' })
    const att = await image(project.id)
    await updateCard(ctx.db, { id: cardA.id, descriptionMd: ref(att.id) })
    const cardB = await createCard(ctx.db, { projectId: project.id, title: 'B' })
    await updateCard(ctx.db, { id: cardB.id, descriptionMd: ref(att.id) })

    await destroyCard(ctx.db, cardA.id)
    expect(await exists(att.id)).toBe(true)

    await destroyCard(ctx.db, cardB.id)
    expect(await exists(att.id)).toBe(false)
  })

  it('cascades to comment-owned images when the card is destroyed', async () => {
    const project = await freshProject(ctx.db)
    const card = await createCard(ctx.db, { projectId: project.id, title: 'C' })
    const comment = await addComment(ctx.db, {
      cardId: card.id,
      author: 'user',
      bodyMd: 'placeholder'
    })
    const att = await image(project.id)
    await updateComment(ctx.db, { id: comment.id, bodyMd: ref(att.id) })

    await destroyCard(ctx.db, card.id)

    expect(await exists(att.id)).toBe(false)
  })

  it('cascades to sub-task images when the parent card is destroyed', async () => {
    const project = await freshProject(ctx.db)
    const parent = await createCard(ctx.db, { projectId: project.id, title: 'P' })
    const child = await createCard(ctx.db, {
      projectId: project.id,
      title: 'Child',
      parentId: parent.id
    })
    const att = await image(project.id)
    await updateCard(ctx.db, { id: child.id, descriptionMd: ref(att.id) })

    await destroyCard(ctx.db, parent.id)

    expect(await exists(att.id)).toBe(false)
  })

  it('destroySprint hard-deletes its cards images with no out-of-scope ref', async () => {
    const project = await freshProject(ctx.db)
    const sprint = await createSprint(ctx.db, { projectId: project.id, name: 'S' })
    const card = await createCard(ctx.db, {
      projectId: project.id,
      sprintId: sprint.id,
      title: 'C'
    })
    const att = await image(project.id)
    await updateCard(ctx.db, { id: card.id, descriptionMd: ref(att.id) })

    await destroySprint(ctx.db, sprint.id)

    expect(await exists(att.id)).toBe(false)
  })

  it('destroySprint keeps a card image still referenced outside the sprint', async () => {
    const project = await freshProject(ctx.db)
    const sprint = await createSprint(ctx.db, { projectId: project.id, name: 'S' })
    const card = await createCard(ctx.db, {
      projectId: project.id,
      sprintId: sprint.id,
      title: 'C'
    })
    const att = await image(project.id)
    await updateCard(ctx.db, { id: card.id, descriptionMd: ref(att.id) })
    const outsider = await createCard(ctx.db, {
      projectId: project.id,
      title: 'Outsider'
    })
    await updateCard(ctx.db, { id: outsider.id, descriptionMd: ref(att.id) })

    await destroySprint(ctx.db, sprint.id)

    expect(await exists(att.id)).toBe(true)
  })

  it('keeps an image still referenced by a living out-of-scope card when a referrer is destroyed', async () => {
    const project = await freshProject(ctx.db)
    const owner = await createCard(ctx.db, { projectId: project.id, title: 'Owner' })
    const att = await image(project.id)
    await updateCard(ctx.db, { id: owner.id, descriptionMd: ref(att.id) })
    const referrer = await createCard(ctx.db, { projectId: project.id, title: 'Ref' })
    await updateCard(ctx.db, { id: referrer.id, descriptionMd: ref(att.id) })

    await destroyCard(ctx.db, referrer.id)

    expect(await exists(att.id)).toBe(true)
  })

  // archivedSprintInert is retired: archiving a sprint UNLINKS its cards, so a
  // card in an archived sprint no longer protects a shared image from a
  // co-referencing destroy. Trade-off of the pure-link model (the archived
  // sprint's images were already byte-degraded by the aggressive drop).
  it('reclaims an image when its last LIVE link is destroyed, even though an archived-sprint card still cites it', async () => {
    const project = await freshProject(ctx.db)
    const sprint = await createSprint(ctx.db, { projectId: project.id, name: 'S' })
    const item = await createIntakeItem(ctx.db, {
      projectId: project.id,
      bodyMd: 'placeholder'
    })
    const att = await image(project.id)
    await updateIntakeItem(ctx.db, { id: item.id, bodyMd: ref(att.id) })
    const card = await createCard(ctx.db, {
      projectId: project.id,
      sprintId: sprint.id,
      title: 'C'
    })
    await updateCard(ctx.db, { id: card.id, descriptionMd: ref(att.id) })

    await archiveSprint(ctx.db, sprint.id)
    await destroyIntakeItem(ctx.db, item.id)

    expect(await exists(att.id)).toBe(false)
  })

  it('destroyDoc hard-deletes images owned by the doc and its subtree', async () => {
    const project = await freshProject(ctx.db)
    const parent = await createDoc(ctx.db, { projectId: project.id, title: 'P' })
    const child = await createDoc(ctx.db, {
      projectId: project.id,
      title: 'Child',
      parentId: parent.id
    })
    const parentAtt = await image(project.id)
    const childAtt = await image(project.id)
    await updateDoc(ctx.db, { id: parent.id, bodyMd: ref(parentAtt.id) })
    await updateDoc(ctx.db, { id: child.id, bodyMd: ref(childAtt.id) })

    await destroyDoc(ctx.db, parent.id)

    expect(await exists(parentAtt.id)).toBe(false)
    expect(await exists(childAtt.id)).toBe(false)
  })

  it('destroyIntakeItem hard-deletes its inbox-owned image', async () => {
    const project = await freshProject(ctx.db)
    const item = await createIntakeItem(ctx.db, {
      projectId: project.id,
      bodyMd: 'placeholder'
    })
    const att = await image(project.id)
    await updateIntakeItem(ctx.db, { id: item.id, bodyMd: ref(att.id) })

    await destroyIntakeItem(ctx.db, item.id)

    expect(await exists(att.id)).toBe(false)
  })
})
