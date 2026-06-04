import { gzipSync } from 'node:zlib'

import { and, eq, inArray } from 'drizzle-orm'

import { type Database, schema } from '@claude-organizer/db'
import {
  BACKUP_FORMAT_VERSION,
  type BackupEnvelope,
  type BackupScope
} from '@claude-organizer/shared'

// Every schema table appears here, parents before children (FK-safe order for
// the importer, CO-142). The coverage test fails if this set ever diverges from
// the schema's tables — that's the "nothing left behind" guarantee.
export const BACKUP_TABLE_NAMES = [
  'projects',
  'roadmaps',
  'sprints',
  'cards',
  'comments',
  'docs',
  'tags',
  'card_tags',
  'card_blockers',
  'card_commits',
  'intake_items'
] as const

function envelope(
  scope: BackupScope,
  projectIds: string[],
  data: Record<string, unknown[]>
): BackupEnvelope {
  return {
    version: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    scope,
    projectIds,
    data
  }
}

const emptyData = (): Record<string, unknown[]> =>
  Object.fromEntries(BACKUP_TABLE_NAMES.map(name => [name, []]))

export async function exportAll(db: Database): Promise<BackupEnvelope> {
  const [
    projects,
    roadmaps,
    sprints,
    cards,
    comments,
    docs,
    tags,
    cardTags,
    cardBlockers,
    cardCommits,
    intakeItems
  ] = await Promise.all([
    db.select().from(schema.projects),
    db.select().from(schema.roadmaps),
    db.select().from(schema.sprints),
    db.select().from(schema.cards),
    db.select().from(schema.comments),
    db.select().from(schema.docs),
    db.select().from(schema.tags),
    db.select().from(schema.cardTags),
    db.select().from(schema.cardBlockers),
    db.select().from(schema.cardCommits),
    db.select().from(schema.intakeItems)
  ])
  return envelope(
    'all',
    projects.map(p => p.id),
    {
      projects,
      roadmaps,
      sprints,
      cards,
      comments,
      docs,
      tags,
      card_tags: cardTags,
      card_blockers: cardBlockers,
      card_commits: cardCommits,
      intake_items: intakeItems
    }
  )
}

export async function exportProject(
  db: Database,
  projectId: string
): Promise<BackupEnvelope> {
  const projects = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
  if (!projects.length) return envelope('project', [], emptyData())

  const cards = await db
    .select()
    .from(schema.cards)
    .where(eq(schema.cards.projectId, projectId))
  const cardIds = cards.map(c => c.id)
  const ofCards = <T>(query: Promise<T[]>): Promise<T[]> =>
    cardIds.length ? query : Promise.resolve([])

  const [
    roadmaps,
    sprints,
    comments,
    docs,
    tags,
    cardTags,
    cardBlockers,
    cardCommits,
    intakeItems
  ] = await Promise.all([
    db
      .select()
      .from(schema.roadmaps)
      .where(eq(schema.roadmaps.projectId, projectId)),
    db
      .select()
      .from(schema.sprints)
      .where(eq(schema.sprints.projectId, projectId)),
    ofCards(
      db
        .select()
        .from(schema.comments)
        .where(inArray(schema.comments.cardId, cardIds))
    ),
    db.select().from(schema.docs).where(eq(schema.docs.projectId, projectId)),
    db.select().from(schema.tags).where(eq(schema.tags.projectId, projectId)),
    ofCards(
      db
        .select()
        .from(schema.cardTags)
        .where(inArray(schema.cardTags.cardId, cardIds))
    ),
    // Only intra-project blocker edges: both ends must live in this project so
    // the backup stays self-contained (no dangling FK for the importer).
    ofCards(
      db
        .select()
        .from(schema.cardBlockers)
        .where(
          and(
            inArray(schema.cardBlockers.blockedCardId, cardIds),
            inArray(schema.cardBlockers.blockerCardId, cardIds)
          )
        )
    ),
    ofCards(
      db
        .select()
        .from(schema.cardCommits)
        .where(inArray(schema.cardCommits.cardId, cardIds))
    ),
    db
      .select()
      .from(schema.intakeItems)
      .where(eq(schema.intakeItems.projectId, projectId))
  ])

  return envelope(
    'project',
    projects.map(p => p.id),
    {
      projects,
      roadmaps,
      sprints,
      cards,
      comments,
      docs,
      tags,
      card_tags: cardTags,
      card_blockers: cardBlockers,
      card_commits: cardCommits,
      intake_items: intakeItems
    }
  )
}

export function serializeBackup(env: BackupEnvelope): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(env), 'utf8'))
}
