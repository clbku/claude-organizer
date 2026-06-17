import { describe, expect, it } from 'vitest'

import {
  addComment,
  addTagToCard,
  archiveCard,
  createCard,
  createTag,
  searchCards
} from '../src/index'
import { freshProject, useTestDb } from './helpers'

const ctx = useTestDb()

describe('searchCards', () => {
  it('matches by card title, ranked by relevance', async () => {
    const project = await freshProject(ctx.db)
    await createCard(ctx.db, {
      projectId: project.id,
      title: 'Implementar busca full-text',
      summary: 'tsvector e ranking'
    })
    await createCard(ctx.db, {
      projectId: project.id,
      title: 'Configurar deploy',
      summary: 'pipeline de release'
    })

    const results = await searchCards(ctx.db, project.id, 'busca')
    expect(results[0]?.title).toBe('Implementar busca full-text')
    expect(results[0]?.matchedComment).toBeNull()
  })

  it('matches a card only via its comment and returns the snippet', async () => {
    const project = await freshProject(ctx.db)
    const card = await createCard(ctx.db, {
      projectId: project.id,
      title: 'Card sem o termo no corpo'
    })
    await addComment(ctx.db, {
      cardId: card!.id,
      author: 'user',
      bodyMd: 'decidimos usar pgvector como evolução futura'
    })

    const results = await searchCards(ctx.db, project.id, 'pgvector')
    expect(results).toHaveLength(1)
    expect(results[0]?.id).toBe(card!.id)
    expect(results[0]?.matchedComment?.snippet).toContain('pgvector')
  })

  it('does not mark the matched comment as read', async () => {
    const project = await freshProject(ctx.db)
    const card = await createCard(ctx.db, {
      projectId: project.id,
      title: 'Higiene de leitura'
    })
    await addComment(ctx.db, {
      cardId: card!.id,
      author: 'user',
      bodyMd: 'termo exclusivo zxcvbnm'
    })

    await searchCards(ctx.db, project.id, 'zxcvbnm')

    const [comment] = await ctx.db.query.comments.findMany({
      where: (c, { eq }) => eq(c.cardId, card!.id)
    })
    expect(comment?.aiStatus).toBe('unread')
  })

  it('finds a card by typo via trigram where tsvector alone would not', async () => {
    const project = await freshProject(ctx.db)
    await createCard(ctx.db, {
      projectId: project.id,
      title: 'Kubernetes deployment guide'
    })

    // "kubernets" is not a whole token in the title, so the `simple` tsvector
    // misses it; pg_trgm word-similarity still matches.
    const results = await searchCards(ctx.db, project.id, 'kubernets')
    expect(results.map(r => r.title)).toContain('Kubernetes deployment guide')
  })

  it('recovers a card via OR-recall when some query terms are absent', async () => {
    const project = await freshProject(ctx.db)
    const target = await createCard(ctx.db, {
      projectId: project.id,
      title: 'Pipeline de emissão fiscal NFC-e',
      summary: 'gera o QR Code'
    })
    await createCard(ctx.db, {
      projectId: project.id,
      title: 'Tarefa sem relação',
      summary: 'outro tema'
    })

    const results = await searchCards(
      ctx.db,
      project.id,
      'NFC-e DANFCE fiscal QR Code PDF'
    )
    expect(results.map(r => r.id)).toContain(target!.id)
  })

  it('matches a card by comment via OR-recall when some terms are absent', async () => {
    const project = await freshProject(ctx.db)
    const card = await createCard(ctx.db, {
      projectId: project.id,
      title: 'Card neutro'
    })
    await addComment(ctx.db, {
      cardId: card!.id,
      author: 'user',
      bodyMd: 'decidimos emitir o QR Code fiscal'
    })

    const results = await searchCards(
      ctx.db,
      project.id,
      'NFC-e DANFCE fiscal QR Code PDF'
    )
    expect(results.map(r => r.id)).toContain(card!.id)
    expect(
      results.find(r => r.id === card!.id)?.matchedComment?.snippet
    ).toMatch(/QR|Code|fiscal/i)
  })

  it('keeps a full-text hit ahead of a pure trigram/typo match', async () => {
    const project = await freshProject(ctx.db)
    await createCard(ctx.db, { projectId: project.id, title: 'deploy guide' })
    // Only reachable via trigram ("kubernets" typo, "deployment" ≠ "deploy"):
    // under the old recall-first rank its high word_similarity beat the real
    // full-text hit; standardized rank now puts the full-text hit first.
    await createCard(ctx.db, {
      projectId: project.id,
      title: 'Kubernetes deployment'
    })

    const results = await searchCards(ctx.db, project.id, 'kubernets deploy')
    expect(results[0]?.title).toBe('deploy guide')
  })

  it('honors -exclude: keeps positives, drops cards with the negated term', async () => {
    const project = await freshProject(ctx.db)
    await createCard(ctx.db, { projectId: project.id, title: 'alpha included' })
    await createCard(ctx.db, {
      projectId: project.id,
      title: 'alpha excluded',
      descriptionMd: 'contém betaword'
    })

    const results = await searchCards(ctx.db, project.id, 'alpha -betaword')
    const titles = results.map(r => r.title)
    expect(titles).toContain('alpha included')
    expect(titles).not.toContain('alpha excluded')
  })

  it('matches a description substring via ILIKE when title/summary do not', async () => {
    const project = await freshProject(ctx.db)
    const card = await createCard(ctx.db, {
      projectId: project.id,
      title: 'Card genérico',
      descriptionMd: 'usa o operador supercalifragilistico'
    })

    const results = await searchCards(ctx.db, project.id, 'califragili')
    expect(results.map(r => r.id)).toContain(card!.id)
  })

  it('returns nothing for an empty/whitespace query', async () => {
    const project = await freshProject(ctx.db)
    await createCard(ctx.db, { projectId: project.id, title: 'qualquer card' })

    expect(await searchCards(ctx.db, project.id, '')).toEqual([])
    expect(await searchCards(ctx.db, project.id, '   ')).toEqual([])
  })

  it('restricts results with the focused-read filters (status + tag)', async () => {
    const project = await freshProject(ctx.db)
    const tag = await createTag(ctx.db, { projectId: project.id, name: 'bug' })
    const open = await createCard(ctx.db, {
      projectId: project.id,
      title: 'corrigir bug de paginação',
      status: 'in_progress'
    })
    const done = await createCard(ctx.db, {
      projectId: project.id,
      title: 'corrigir bug de cache',
      status: 'done'
    })
    await addTagToCard(ctx.db, open!.id, tag!.id)

    const active = await searchCards(ctx.db, project.id, 'corrigir', {
      activeOnly: true
    })
    expect(active.map(r => r.id)).toEqual([open!.id])

    const tagged = await searchCards(ctx.db, project.id, 'corrigir', {
      tag: 'bug'
    })
    expect(tagged.map(r => r.id)).toContain(open!.id)
    expect(tagged.map(r => r.id)).not.toContain(done!.id)
  })

  it('pins the exact-key card first, ahead of cards that only mention the key', async () => {
    const project = await freshProject(ctx.db)
    const target = await createCard(ctx.db, {
      projectId: project.id,
      title: 'Alvo do match exato'
    })
    await createCard(ctx.db, {
      projectId: project.id,
      title: `Depende de ${target!.key}`,
      descriptionMd: `bloqueado por ${target!.key}, ver ${target!.key}`
    })

    const results = await searchCards(ctx.db, project.id, target!.key)
    expect(results[0]?.id).toBe(target!.id)
    expect(results.length).toBeGreaterThan(1)
  })

  it('pins by a bare number resolved through the project keyPrefix', async () => {
    const project = await freshProject(ctx.db)
    const target = await createCard(ctx.db, {
      projectId: project.id,
      title: 'Alvo por número puro'
    })
    const seq = target!.key.split('-')[1]!

    const results = await searchCards(ctx.db, project.id, seq)
    expect(results[0]?.id).toBe(target!.id)
  })

  it('matches the exact key case-insensitively', async () => {
    const project = await freshProject(ctx.db)
    const target = await createCard(ctx.db, {
      projectId: project.id,
      title: 'Alvo case-insensitive'
    })

    const results = await searchCards(
      ctx.db,
      project.id,
      target!.key.toLowerCase()
    )
    expect(results[0]?.id).toBe(target!.id)
  })

  it('does not pin the exact-key card when it is filtered out (archived)', async () => {
    const project = await freshProject(ctx.db)
    const target = await createCard(ctx.db, {
      projectId: project.id,
      title: 'Alvo arquivado'
    })
    await archiveCard(ctx.db, target!.id)

    const results = await searchCards(ctx.db, project.id, target!.key)
    expect(results.map(r => r.id)).not.toContain(target!.id)
  })

  it('does not pin when a bare number resolves to a non-existent key', async () => {
    const project = await freshProject(ctx.db)
    const mention = await createCard(ctx.db, {
      projectId: project.id,
      title: 'Tarefa 999 de teste'
    })

    // No card with key <prefix>-999 exists, so nothing is pinned; the card that
    // merely contains "999" still surfaces by normal full-text rank.
    const results = await searchCards(ctx.db, project.id, '999')
    expect(results.map(r => r.id)).toContain(mention!.id)
  })

  it('pins under an active filter when the exact-key card passes it', async () => {
    const project = await freshProject(ctx.db)
    const tag = await createTag(ctx.db, { projectId: project.id, name: 'rel' })
    const target = await createCard(ctx.db, {
      projectId: project.id,
      title: 'Alvo com tag',
      status: 'in_progress'
    })
    await addTagToCard(ctx.db, target!.id, tag!.id)
    await createCard(ctx.db, {
      projectId: project.id,
      title: `menciona ${target!.key}`,
      status: 'in_progress'
    })

    const results = await searchCards(ctx.db, project.id, target!.key, {
      tag: 'rel'
    })
    expect(results[0]?.id).toBe(target!.id)
  })

  it('keeps the pinned card on the first page only (no leak to page 2)', async () => {
    const project = await freshProject(ctx.db)
    const target = await createCard(ctx.db, {
      projectId: project.id,
      title: 'Alvo paginado'
    })
    await createCard(ctx.db, {
      projectId: project.id,
      title: `liga a ${target!.key}`,
      descriptionMd: `${target!.key} ${target!.key}`
    })

    const page1 = await searchCards(ctx.db, project.id, target!.key, {
      limit: 1
    })
    expect(page1.map(r => r.id)).toEqual([target!.id])

    const page2 = await searchCards(ctx.db, project.id, target!.key, {
      limit: 1,
      offset: 1
    })
    expect(page2.map(r => r.id)).not.toContain(target!.id)
  })

  it('treats a key with trailing text as a normal query, not an exact-key pin', async () => {
    const project = await freshProject(ctx.db)
    const target = await createCard(ctx.db, {
      projectId: project.id,
      title: 'Alvo com texto extra'
    })

    const results = await searchCards(
      ctx.db,
      project.id,
      `${target!.key} bug`
    )
    expect(results.map(r => r.id)).toContain(target!.id)
  })
})
