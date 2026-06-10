import type {
  CardStatus,
  CommentAuthor,
  DocKind,
  IntakeStatus,
  RepoProvider,
  SprintStatus,
  UserRole,
  UserStatus
} from './enums'

/*
 * Persisted-row types, in API wire form: timestamps are ISO `string`s (what the
 * REST API serializes and the UI receives), not `Date`s.
 *
 * These mirror the Drizzle schema column-for-column and are kept in lockstep by
 * a compile-time conformance check in @claude-organizer/db (src/conformance.ts):
 * adding, renaming or retyping a column there breaks `pnpm typecheck` until the
 * matching field here is updated. The DTOs below build on these rows.
 */

export interface CardRow {
  id: string
  projectId: string
  sprintId: string | null
  parentId: string | null
  key: string
  title: string
  summary: string | null
  descriptionMd: string | null
  status: CardStatus
  priority: number
  dueDate: string | null
  position: number
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export interface SprintRow {
  id: string
  projectId: string
  roadmapId: string | null
  name: string
  goal: string | null
  status: SprintStatus
  startsAt: string | null
  endsAt: string | null
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export interface CommentRow {
  id: string
  cardId: string
  author: CommentAuthor
  userId: string | null
  bodyMd: string
  readByAi: boolean
  createdAt: string
}

export interface CardCommitRow {
  id: string
  cardId: string
  sha: string
  message: string
  stat: string | null
  diff: string | null
  committedAt: string | null
  authorName: string | null
  createdAt: string
}

export interface CardClaimRow {
  cardId: string
  ownerToken: string
  ownerLabel: string | null
  claimedAt: string
}

/**
 * Inbox attachments are image proofs/mockups only and stay small — enforced on
 * the raw upload, before server-side compression (cards keep the permissive
 * 20MB-post-compression rule). Shared so the web can reject before uploading.
 */
export const MAX_INBOX_IMAGE_BYTES = 5 * 1024 * 1024
export const INBOX_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
] as const

/**
 * File attached to a card or an intake item. At most one of `cardId` /
 * `intakeItemId` is set; both null = a staged upload (composing a new intake
 * item), anchored to its project until associated or swept.
 */
export interface AttachmentRow {
  id: string
  projectId: string
  cardId: string | null
  intakeItemId: string | null
  filename: string
  mimeType: string
  size: number
  storagePath: string
  uploaderLabel: string | null
  createdAt: string
}

export interface DocRow {
  id: string
  projectId: string
  parentId: string | null
  title: string
  summary: string | null
  bodyMd: string | null
  kind: DocKind
  position: number
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export interface ProjectRow {
  id: string
  slug: string
  name: string
  description: string | null
  keyPrefix: string
  nextKeySeq: number
  repoProvider: RepoProvider | null
  repoWebUrl: string | null
  repoLocalPath: string | null
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export interface TagRow {
  id: string
  projectId: string
  name: string
  color: string
  createdAt: string
}

export interface RoadmapRow {
  id: string
  projectId: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export interface IntakeItemRow {
  id: string
  projectId: string
  bodyMd: string
  status: IntakeStatus
  plannedCardKeys: string | null
  createdAt: string
  updatedAt: string
  archivedAt: string | null
  enrichedBodyMd: string | null
  contextNotesMd: string | null
  draftPlanMd: string | null
  enrichedAt: string | null
}

export interface UserAuthzRow {
  userId: string
  role: UserRole
  status: UserStatus
  allProjects: boolean
  createdAt: string
  updatedAt: string
}

export interface UserProjectAccessRow {
  userId: string
  projectId: string
  createdAt: string
}

export interface SystemSettingsRow {
  id: string
  authEnabled: boolean
  keepDiffsOnArchive: boolean
  createdAt: string
  updatedAt: string
}

/* ---- API DTOs: what the REST endpoints return and the UI consumes ---- */

export type Project = ProjectRow
export type Roadmap = RoadmapRow
export type CardCommit = CardCommitRow
export type Attachment = AttachmentRow
/** Compat alias from when attachments were card-only. */
export type CardAttachment = AttachmentRow

/**
 * Comment as returned by the API. `authorName`/`authorImage` are joined from the
 * `user` author's identity (null for `ai` comments and for legacy `user`
 * comments with no `userId`); the UI falls back to a generic label when absent.
 */
export interface Comment extends CommentRow {
  authorName: string | null
  authorImage: string | null
}

/**
 * Intake item as returned by the API. `completed` is derived at read time for
 * planned items: true when ≥1 referenced card is non-archived and all
 * non-archived referenced cards are `done` (archived/destroyed cards ignored).
 */
export interface IntakeItem extends IntakeItemRow {
  completed?: boolean
  attachmentCount?: number
}

/** Tag as embedded in cards or listed for a project (createdAt not surfaced). */
export interface Tag {
  id: string
  projectId: string
  name: string
  color: string
}

/** Sprint as returned by the API. `archivedAt` is optional: list endpoints may omit it. */
export interface Sprint extends Omit<SprintRow, 'archivedAt'> {
  archivedAt?: string | null
}

export interface CardSubtask {
  id: string
  key: string
  title: string
  status: CardStatus
  priority: number
}

export interface CardParent {
  id: string
  key: string
  title: string
  status: CardStatus
}

/**
 * Advisory claim as surfaced on card reads — the opaque `ownerToken` is never
 * exposed, only who holds it (`ownerLabel`, null for a generic/no-auth session)
 * and since when. Ownership is enforced at claim/release/take-over time.
 */
export interface CardClaim {
  ownerLabel: string | null
  claimedAt: string
}

/**
 * Card as returned by the API. List endpoints omit `descriptionMd`/`archivedAt`;
 * detail endpoints add joins (tags, subtasks, parent, blockers). Hence those
 * fields are optional here.
 */
export interface Card extends Omit<CardRow, 'descriptionMd' | 'archivedAt'> {
  descriptionMd?: string | null
  archivedAt?: string | null
  tags?: Tag[]
  parentKey?: string | null
  subtaskCount?: number
  subtaskDone?: number
  subtasks?: CardSubtask[]
  parent?: CardParent | null
  blockedBy?: CardParent[]
  blocking?: CardParent[]
  blockedByPending?: number
  claim?: CardClaim | null
  attachmentCount?: number
  attachments?: CardAttachment[]
}

/** Doc list item: no body, `archivedAt` optional (list endpoints omit it). */
export interface DocSummary extends Omit<DocRow, 'bodyMd' | 'archivedAt'> {
  archivedAt?: string | null
}

/** Full doc, including the markdown body. */
export interface Doc extends DocSummary {
  bodyMd: string | null
}
