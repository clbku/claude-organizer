import { execFile } from 'node:child_process'
import { statSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

import { and, desc, eq, lt, sql } from 'drizzle-orm'
import { z } from 'zod'

import { createId, type Database, schema } from '@claude-organizer/db'

import { getAiExecutionService } from './aiExecution'
import { claimCard, releaseClaimOnDone } from './cardClaims'
import { getCardByKey, updateCard } from './cards'
import { addComment, listComments } from './comments'
import { ConflictError, InputError } from './errors'
import { notify } from './events'

const execFileP = promisify(execFile)

// Label stamped on the advisory claim while a run holds a card, so the board
// shows "auto-runner" rather than a human session.
const AUTO_RUNNER_LABEL = 'auto-runner'

// Subagent-spawning tools are disallowed so the run stays a single bounded agent
// (no fan-out), the same constraint enrichment applies (CO-4).
const DISALLOWED_TOOLS = ['Agent', 'Workflow']

// A runner pass implements a whole task, so it gets far longer than enrichment.
// Past it the port cancels the job and reports `timeout`.
const RUNNER_TIMEOUT_MS = Number(process.env.CO_RUNNER_TIMEOUT_MS) || 30 * 60_000

// Default 1 concurrent run per project; raise via env. The `running` rows in
// card_runs are the source of truth, so the guard holds across processes.
const MAX_CONCURRENCY = Math.max(1, Number(process.env.CO_RUNNER_MAX_CONCURRENCY) || 1)

// A run still `running` past this — its process died (container restart, crash)
// so the in-memory completion never fired — is reaped by the boot/interval
// sweep. Comfortably exceeds the port timeout so a live run is never reaped.
const RECONCILE_THRESHOLD_MS = RUNNER_TIMEOUT_MS + 5 * 60_000

export const triggerCardRunInput = z.object({
  cardKey: z.string().min(1)
})
export type TriggerCardRunInput = z.infer<typeof triggerCardRunInput>

type CardForRun = NonNullable<Awaited<ReturnType<typeof getCardByKey>>>

// Acceptance criteria are free-form prose, so detection is a heuristic: the
// description must mention an acceptance section, in English or the user's
// Vietnamese. Good enough to reject an empty/placeholder card; a real spec
// always has one.
function hasAcceptanceCriteria(descriptionMd: string | null | undefined): boolean {
  if (!descriptionMd) return false
  return /accept/i.test(descriptionMd) || /tiêu chí/i.test(descriptionMd)
}

// A leaf task only: no children, still un-started, no unfinished blocker, and a
// spec with acceptance criteria. Throws InputError (→ 400) with the reason.
function assertEligible(card: CardForRun): void {
  if ((card.subtasks?.length ?? 0) > 0) {
    throw new InputError(`${card.key} is a story (has sub-tasks); only a leaf task can auto-run`)
  }
  if (card.status !== 'todo') {
    throw new InputError(`${card.key} is "${card.status}"; only a "todo" card can auto-run`)
  }
  const pendingBlockers = (card.blockedBy ?? []).filter(b => b.status !== 'done')
  if (pendingBlockers.length > 0) {
    const keys = pendingBlockers.map(b => b.key).join(', ')
    throw new InputError(`${card.key} is blocked by an unfinished card (${keys})`)
  }
  if (!hasAcceptanceCriteria(card.descriptionMd)) {
    throw new InputError(`${card.key} has no acceptance criteria to verify against`)
  }
}

// The project's local checkout is the base for the worktree. Missing or not
// mounted in this process → reject (mirrors enrichment's resolveEnrichCwd guard).
async function resolveRepoLocalPath(db: Database, projectId: string): Promise<string> {
  const [project] = await db
    .select({ repoLocalPath: schema.projects.repoLocalPath })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1)
  const repoLocalPath = project?.repoLocalPath ?? null
  if (!repoLocalPath) {
    throw new InputError('Project has no repoLocalPath; set it before auto-running a card')
  }
  try {
    if (!statSync(repoLocalPath).isDirectory()) throw new Error('not a directory')
  } catch {
    throw new InputError(`repoLocalPath "${repoLocalPath}" is not mounted in this process`)
  }
  return repoLocalPath
}

function git(cwd: string, args: string[]) {
  return execFileP('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 })
}

// Remove a leftover worktree still checked out on this branch — e.g. one a prior
// successful run kept for review — so `worktree add -B` doesn't fail on a branch
// that's checked out elsewhere. This is also when an old kept worktree is reaped.
async function removeWorktreeForBranch(repoLocalPath: string, branch: string): Promise<void> {
  let stdout: string
  try {
    ({ stdout } = await git(repoLocalPath, ['worktree', 'list', '--porcelain']))
  } catch {
    return
  }
  const ref = `refs/heads/${branch}`
  let currentPath: string | null = null
  for (const line of stdout.split('\n')) {
    if (line.startsWith('worktree ')) currentPath = line.slice('worktree '.length)
    else if (line === `branch ${ref}` && currentPath) {
      await git(repoLocalPath, ['worktree', 'remove', '--force', currentPath]).catch(() => {})
    }
  }
}

async function createWorktree(repoLocalPath: string, branch: string, worktreePath: string): Promise<void> {
  await mkdir(dirname(worktreePath), { recursive: true })
  await git(repoLocalPath, ['worktree', 'prune']).catch(() => {})
  await removeWorktreeForBranch(repoLocalPath, branch)
  // -B resets the branch to the repo's current HEAD, so each run starts clean.
  await git(repoLocalPath, ['worktree', 'add', '-B', branch, worktreePath, 'HEAD'])
}

async function cleanupWorktree(
  repoLocalPath: string | null,
  worktreePath: string | null,
  branch: string | null
): Promise<void> {
  if (!repoLocalPath || !worktreePath) return
  await git(repoLocalPath, ['worktree', 'remove', '--force', worktreePath]).catch(() => {})
  await git(repoLocalPath, ['worktree', 'prune']).catch(() => {})
  if (branch) await git(repoLocalPath, ['branch', '-D', branch]).catch(() => {})
}

function buildRunnerPrompt(card: CardForRun, comments: { author: string, bodyMd: string }[]): string {
  const commentsText = comments.length
    ? comments.map(c => `[${c.author}] ${c.bodyMd}`).join('\n\n---\n\n')
    : '(no comments)'
  return `You are an autonomous software engineer implementing ONE task in the current working directory, which is an isolated git worktree of the project. Follow the repository's own conventions — read its CLAUDE.md and match the existing code patterns. Do NOT spawn subagents.

TASK ${card.key}: ${card.title}

DESCRIPTION (includes acceptance criteria):
---
${card.descriptionMd ?? ''}
---

EXISTING COMMENTS ON THIS TASK (decisions, constraints — read before coding):
---
${commentsText}
---

Your job:
1. Explore the codebase in the current directory to understand what the change requires.
2. Implement the task so EVERY acceptance criterion is met, matching the existing style. Run the project's typecheck/lint if available and fix anything you introduced.

CRITICAL — Human-in-the-loop stop point:
- DO NOT commit. DO NOT run \`git commit\`, \`git push\`, \`git add\`, or open a PR.
- Leave ALL your changes UNCOMMITTED in the working tree; a human reviews the diff and decides.

When finished, output a concise report with exactly these two markdown sections and nothing else:
## What changed
<bullet list of files/areas and what you did>
## Test plan
<how a reviewer should verify it works>`
}

function buildResultComment(text: string, branch: string, worktreePath: string): string {
  const summary = text.trim() || '(the runner produced no summary)'
  return `## Auto-run finished — ready for review

The auto-implement runner generated changes in an isolated worktree. Review the diff there, then decide whether to commit (the runner never commits).

- **Branch**: \`${branch}\`
- **Worktree**: \`${worktreePath}\`

---

${summary}`
}

// A reference to a run plus its card key, enough to finalize and notify.
interface RunRef {
  id: string
  cardId: string
  cardKey?: string
  projectId: string
  branch: string | null
  worktreePath: string | null
}

// Atomically flip a still-`running` run to `failed`; returns whether THIS call won
// the transition. So a cancel racing a successful completion (or two failure
// paths) can't both act — the loser bails instead of stomping a finalized state,
// e.g. wiping the review worktree a just-completed run deliberately kept.
async function transitionToFailed(db: Database, runId: string, reason: string): Promise<boolean> {
  const rows = await db
    .update(schema.cardRuns)
    .set({ status: 'failed', error: reason.slice(0, 2000), updatedAt: sql`now()` })
    .where(and(eq(schema.cardRuns.id, runId), eq(schema.cardRuns.status, 'running')))
    .returning({ id: schema.cardRuns.id })
  return rows.length > 0
}

// Finalize a failed/cancelled/reconciled run: flip it to failed, reset the card to
// its un-started status, drop the claim, and remove the worktree. The atomic
// transition makes it safe against a race — if another path already finalized this
// run, we bail without touching the card or the worktree.
async function failRun(
  db: Database,
  run: RunRef,
  repoLocalPath: string | null,
  reason: string
): Promise<void> {
  if (!(await transitionToFailed(db, run.id, reason))) return
  await updateCard(db, { id: run.cardId, status: 'todo' })
  await releaseClaimOnDone(db, run.cardId)
  await cleanupWorktree(repoLocalPath, run.worktreePath, run.branch)
  await notify(db, { type: 'card.changed', projectId: run.projectId, cardId: run.cardId, cardKey: run.cardKey })
}

// Await the AI result and finalize. The success transition is guarded on the run
// still being `running`, so if a cancel/reconcile finalized it first this just
// returns and lets that path own the cleanup — never overwriting a terminal state.
async function completeRun(
  db: Database,
  run: RunRef & { branch: string, worktreePath: string },
  repoLocalPath: string,
  resultP: Promise<{ status: string, text: string }>
): Promise<void> {
  const result = await resultP
  if (result.status === 'ok') {
    const won = await db
      .update(schema.cardRuns)
      .set({ status: 'done', updatedAt: sql`now()` })
      .where(and(eq(schema.cardRuns.id, run.id), eq(schema.cardRuns.status, 'running')))
      .returning({ id: schema.cardRuns.id })
    if (won.length === 0) return
    await updateCard(db, { id: run.cardId, status: 'review' })
    await addComment(db, {
      cardId: run.cardId,
      author: 'ai',
      bodyMd: buildResultComment(result.text, run.branch, run.worktreePath)
    })
    await releaseClaimOnDone(db, run.cardId)
    // Worktree kept on purpose so the user can review the diff (path on the run).
    await notify(db, { type: 'card.changed', projectId: run.projectId, cardId: run.cardId, cardKey: run.cardKey })
  } else {
    await failRun(db, run, repoLocalPath, `AI run ended as "${result.status}"`)
  }
}

/**
 * Trigger one auto-implement run for a leaf card and return its accepted state.
 * Validates eligibility, the per-project concurrency limit, the claim and the
 * repo checkout up front (each rejection throws with a reason and leaves no claim
 * or worktree behind), then claims the card, opens an isolated worktree, moves
 * the card to in_progress, and hands the work to the AI execution port. The run
 * settles in the background (`completeRun`): on success the card ends at `review`
 * with a test-plan comment and the worktree kept for diff review; the engine
 * never commits. Shared by the API route (CO-29) and the MCP tool (CO-30).
 */
export async function triggerCardRun(db: Database, input: TriggerCardRunInput) {
  const { cardKey } = triggerCardRunInput.parse(input)
  const card = await getCardByKey(db, cardKey)
  if (!card) throw new InputError(`Card ${cardKey} not found`)

  assertEligible(card)
  const repoLocalPath = await resolveRepoLocalPath(db, card.projectId)

  const runId = createId('run')
  const branch = `auto/${card.key}`
  const base = process.env.CO_RUNNER_WORKTREE_DIR || join(tmpdir(), 'co-runner')
  const worktreePath = join(base, runId)
  const run: RunRef & { branch: string, worktreePath: string }
    = { id: runId, cardId: card.id, cardKey: card.key, projectId: card.projectId, branch, worktreePath }

  // Reserve the card through the shared guarded claim — atomic, and it rejects a
  // card already held by anyone else (a human session or another run), closing the
  // TOCTOU a manual upsert would leave open. Token = runId so cancel/reconcile/
  // completion can drop it unconditionally (releaseClaimOnDone is token-free).
  const claimRes = await claimCard(db, {
    cardId: card.id,
    ownerToken: runId,
    ownerLabel: AUTO_RUNNER_LABEL
  })
  if (!claimRes.ok) {
    throw new ConflictError(
      `${card.key} is reserved by ${claimRes.claim?.ownerLabel ?? 'another session'}; release it first`
    )
  }

  // Enforce the per-project concurrency limit atomically with creating the run row:
  // a transaction-scoped advisory lock serializes concurrent triggers (across
  // processes too) so the count and the insert can't interleave and both pass.
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`co-runner:${card.projectId}`}))`)
      const [c] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.cardRuns)
        .where(and(eq(schema.cardRuns.projectId, card.projectId), eq(schema.cardRuns.status, 'running')))
      if ((c?.count ?? 0) >= MAX_CONCURRENCY) {
        throw new ConflictError(
          `Concurrency limit reached (${MAX_CONCURRENCY} run/project); wait for the current run to finish`
        )
      }
      await tx
        .insert(schema.cardRuns)
        .values({ id: runId, cardId: card.id, projectId: card.projectId, branch, worktreePath })
    })
  } catch (err) {
    await releaseClaimOnDone(db, card.id)
    throw err
  }

  try {
    await createWorktree(repoLocalPath, branch, worktreePath)
    await updateCard(db, { id: card.id, status: 'in_progress' })
    // Skip the runner's own prior result comments so a re-run isn't fed its own
    // past output as if it were a human decision.
    const comments = (await listComments(db, card.id)).filter(
      c => !(c.author === 'ai' && c.bodyMd.startsWith('## Auto-run finished'))
    )
    const handle = await getAiExecutionService().start({
      prompt: buildRunnerPrompt(card, comments),
      cwd: worktreePath,
      disallowedTools: DISALLOWED_TOOLS,
      timeoutMs: RUNNER_TIMEOUT_MS,
      model: process.env.CO_RUNNER_MODEL || undefined
    })
    await db
      .update(schema.cardRuns)
      .set({ jobId: handle.jobId, updatedAt: sql`now()` })
      .where(eq(schema.cardRuns.id, runId))
    void completeRun(db, run, repoLocalPath, handle.result)
    return { runId, cardId: card.id, cardKey: card.key, branch, worktreePath, status: 'running' as const }
  } catch (err) {
    // Setup failed after the claim/run row: unwind so nothing is left reserved or
    // half-created, then surface the reason.
    await failRun(db, run, repoLocalPath, `Failed to start: ${(err as Error).message}`).catch(() => {})
    throw new InputError(`Could not start auto-run for ${card.key}: ${(err as Error).message}`)
  }
}

/** Latest run for a card (wire shape — jobId stays internal), or null. */
export async function getLatestCardRun(db: Database, cardId: string) {
  const [row] = await db
    .select({
      id: schema.cardRuns.id,
      cardId: schema.cardRuns.cardId,
      projectId: schema.cardRuns.projectId,
      status: schema.cardRuns.status,
      worktreePath: schema.cardRuns.worktreePath,
      branch: schema.cardRuns.branch,
      error: schema.cardRuns.error,
      createdAt: schema.cardRuns.createdAt,
      updatedAt: schema.cardRuns.updatedAt
    })
    .from(schema.cardRuns)
    .where(eq(schema.cardRuns.cardId, cardId))
    .orderBy(desc(schema.cardRuns.createdAt))
    .limit(1)
  return row ?? null
}

/**
 * Cancel a running run: kill the AI job via the port, mark the run failed, reset
 * the card to its un-started status, drop the claim and remove the worktree.
 * Idempotent — a run that already finished is a no-op.
 */
export async function cancelCardRun(db: Database, runId: string): Promise<{ ok: boolean }> {
  const [run] = await db
    .select({
      id: schema.cardRuns.id,
      cardId: schema.cardRuns.cardId,
      cardKey: schema.cards.key,
      projectId: schema.cardRuns.projectId,
      status: schema.cardRuns.status,
      jobId: schema.cardRuns.jobId,
      branch: schema.cardRuns.branch,
      worktreePath: schema.cardRuns.worktreePath
    })
    .from(schema.cardRuns)
    .innerJoin(schema.cards, eq(schema.cards.id, schema.cardRuns.cardId))
    .where(eq(schema.cardRuns.id, runId))
    .limit(1)
  if (!run) throw new InputError(`Run ${runId} not found`)
  if (run.status !== 'running') return { ok: true }

  getAiExecutionService().cancel(run.jobId)
  const [project] = await db
    .select({ repoLocalPath: schema.projects.repoLocalPath })
    .from(schema.projects)
    .where(eq(schema.projects.id, run.projectId))
    .limit(1)
  await failRun(db, run, project?.repoLocalPath ?? null, 'Cancelled by user')
  return { ok: true }
}

/**
 * Recover runs stuck in `running` whose process died (container restart, crash)
 * so the in-memory completion never fired. DB-driven, so it also reaps runs
 * spawned by another process. Each is killed (best-effort), marked failed, its
 * card reset to un-started, claim dropped and worktree removed. Returns the count.
 */
export async function reconcileStuckCardRuns(db: Database): Promise<number> {
  const stale = await db
    .select({
      id: schema.cardRuns.id,
      cardId: schema.cardRuns.cardId,
      cardKey: schema.cards.key,
      projectId: schema.cardRuns.projectId,
      jobId: schema.cardRuns.jobId,
      branch: schema.cardRuns.branch,
      worktreePath: schema.cardRuns.worktreePath
    })
    .from(schema.cardRuns)
    .innerJoin(schema.cards, eq(schema.cards.id, schema.cardRuns.cardId))
    .where(
      and(
        eq(schema.cardRuns.status, 'running'),
        lt(
          schema.cardRuns.updatedAt,
          sql`now() - make_interval(secs => ${RECONCILE_THRESHOLD_MS / 1000})`
        )
      )
    )
  for (const run of stale) {
    getAiExecutionService().cancel(run.jobId)
    const [project] = await db
      .select({ repoLocalPath: schema.projects.repoLocalPath })
      .from(schema.projects)
      .where(eq(schema.projects.id, run.projectId))
      .limit(1)
    await failRun(db, run, project?.repoLocalPath ?? null, 'Reconciled: run orphaned by a dead process')
  }
  return stale.length
}
