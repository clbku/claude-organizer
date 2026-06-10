import { and, eq, lt, sql } from 'drizzle-orm'
import { statSync } from 'fs'
import { tmpdir } from 'os'

import { type Database, schema } from '@claude-organizer/db'

import { getAiExecutionService } from './aiExecution'
import { notify } from './events'

// Items left in `enriching` longer than this — orphaned by a process that died
// mid-run, or a runaway agent — are swept back to pending. Must comfortably
// exceed the slowest legitimate run.
const ENRICHMENT_TIMEOUT_MS = 15 * 60_000

// Subagent-spawning tools are disallowed so Claude explores directly (bounded)
// instead of fanning out subagents — which blew enrichment runtime up to minutes.
const DISALLOWED_TOOLS = ['Agent', 'Workflow']

function buildPrompt(bodyMd: string, explore: boolean): string {
  // When the cwd is the project's own checkout, let Claude explore it directly;
  // otherwise enrich from the text alone so it never cites an unrelated repo.
  // Either way it must not spawn subagents (also enforced via --disallowed-tools).
  const context = explore
    ? 'You may use the bash and file-reading tools to briefly explore the codebase yourself (your current working directory is this project\'s repository) for context. Do NOT spawn subagents.'
    : 'No project codebase is available in your working directory. Enrich from the demand text alone — do NOT read files, run commands, or spawn subagents, and keep contextNotesMd to general guidance without referencing specific files.'

  return `You are enriching a software demand captured in a project inbox. ${context}

The demand to enrich:
---
${bodyMd}
---

Produce a JSON object with exactly these three fields:
- "enrichedBodyMd": string — the demand rewritten with clarity and actionable scope
- "contextNotesMd": string — relevant architectural context, existing patterns, or constraints a developer should know
- "draftPlanMd": string — preliminary breakdown of tasks to implement this demand

Respond with ONLY the JSON object. No markdown fences. No explanation.`
}

// Resolve the cwd Claude should run in: the project's local checkout when it is
// configured AND present on this filesystem, else a neutral temp dir (so an
// unrelated repo — e.g. the server's own /app — is never explored by mistake).
function resolveEnrichCwd(repoLocalPath: string | null): { cwd: string, explore: boolean } {
  if (repoLocalPath) {
    try {
      if (statSync(repoLocalPath).isDirectory()) return { cwd: repoLocalPath, explore: true }
    } catch {
      // path not mounted / missing in this process — fall through to text-only
    }
  }
  return { cwd: tmpdir(), explore: false }
}

async function markEnriched(
  db: Database,
  id: string,
  projectId: string,
  result: { enrichedBodyMd: string, contextNotesMd: string, draftPlanMd: string }
) {
  await db
    .update(schema.intakeItems)
    .set({
      status: 'enriched',
      enrichedBodyMd: result.enrichedBodyMd,
      contextNotesMd: result.contextNotesMd,
      draftPlanMd: result.draftPlanMd,
      enrichedAt: sql`now()`,
      subprocessId: null,
      updatedAt: sql`now()`
    })
    .where(eq(schema.intakeItems.id, id))
  await notify(db, { type: 'inbox.changed', projectId, intakeId: id })
}

async function markFailed(db: Database, id: string, projectId: string) {
  await db
    .update(schema.intakeItems)
    .set({
      status: 'pending',
      enrichedBodyMd: null,
      contextNotesMd: null,
      draftPlanMd: null,
      enrichedAt: null,
      subprocessId: null,
      updatedAt: sql`now()`
    })
    .where(eq(schema.intakeItems.id, id))
  await notify(db, { type: 'inbox.changed', projectId, intakeId: id })
}

// Cancel a running enrichment by its jobId (the persisted subprocessId). The port
// owns the live-job registry and the cross-process process.kill(pid) fallback, so
// this is a thin pass-through; a null id is a no-op.
export function killEnrichment(subprocessId: string | null) {
  getAiExecutionService().cancel(subprocessId)
}

export async function spawnEnrichment(
  db: Database,
  item: { id: string, projectId: string, bodyMd: string }
) {
  // Tests must never start a real `claude -p`: it runs in the background and its
  // result settles at a non-deterministic time, racing assertions (and the 15-min
  // run hangs the suite). The runner sets ENRICHMENT=off (see vitest.config).
  if (process.env.ENRICHMENT === 'off') return
  // Run the model inside the project's own checkout so it explores the right code;
  // fall back to a neutral cwd + text-only prompt when no valid path is set.
  const [project] = await db
    .select({ repoLocalPath: schema.projects.repoLocalPath })
    .from(schema.projects)
    .where(eq(schema.projects.id, item.projectId))
    .limit(1)
  const { cwd, explore } = resolveEnrichCwd(project?.repoLocalPath ?? null)

  // Hand the run to the AI execution port. The adapter owns spawn/stdin, the
  // running-job registry, the watchdog, and the cancel/kill fallback; enrichment
  // keeps only its own concerns — the prompt, persisting the jobId, and parsing
  // the three-field JSON out of the model's output.
  const handle = await getAiExecutionService().start({
    prompt: buildPrompt(item.bodyMd, explore),
    cwd,
    disallowedTools: DISALLOWED_TOOLS,
    timeoutMs: ENRICHMENT_TIMEOUT_MS
  })

  if (!handle.jobId) {
    await markFailed(db, item.id, item.projectId)
    return
  }

  // Persist the jobId so a re-edit, archive, or boot-time sweep can cancel or
  // reconcile this run — the port's jobId is the OS pid, valid across processes.
  const subprocessId = handle.jobId
  await db
    .update(schema.intakeItems)
    .set({ subprocessId, updatedAt: sql`now()` })
    .where(eq(schema.intakeItems.id, item.id))

  const result = await handle.result

  // Bail if superseded by a newer spawn (a re-edit cleared/replaced subprocessId)
  // or the item was deleted — never write a stale run's output over current state.
  const [current] = await db
    .select({ subprocessId: schema.intakeItems.subprocessId })
    .from(schema.intakeItems)
    .where(eq(schema.intakeItems.id, item.id))
    .limit(1)
  if (!current || current.subprocessId !== subprocessId) return

  if (result.status === 'ok') {
    try {
      // The agentic CLI often wraps the JSON in prose ("Now I have enough
      // context…") or markdown fences despite the prompt, so extract the
      // outermost { … } object instead of requiring the whole output to parse.
      const text = result.text
      const start = text.indexOf('{')
      const end = text.lastIndexOf('}')
      const jsonText = start !== -1 && end > start ? text.slice(start, end + 1) : text
      const parsed = JSON.parse(jsonText)
      if (typeof parsed.enrichedBodyMd === 'string') {
        await markEnriched(db, item.id, item.projectId, {
          enrichedBodyMd: parsed.enrichedBodyMd,
          contextNotesMd: String(parsed.contextNotesMd ?? ''),
          draftPlanMd: String(parsed.draftPlanMd ?? '')
        })
        return
      }
    } catch {
      // fall through to markFailed
    }
  }
  await markFailed(db, item.id, item.projectId)
}

/**
 * Recover inbox items stuck in `enriching`: either orphaned because their
 * spawning process died (container restart, crash) so the in-memory close
 * handler never fired, or a run that has exceeded the timeout. DB-driven, so it
 * also catches items spawned by another process (e.g. the mcp server). Each is
 * marked failed (→ pending) for a manual retry; a best-effort kill stops any
 * local process still lingering. Returns the number reconciled.
 */
export async function reconcileStuckEnrichment(db: Database): Promise<number> {
  const stale = await db
    .select({
      id: schema.intakeItems.id,
      projectId: schema.intakeItems.projectId,
      subprocessId: schema.intakeItems.subprocessId
    })
    .from(schema.intakeItems)
    .where(
      and(
        eq(schema.intakeItems.status, 'enriching'),
        lt(
          schema.intakeItems.updatedAt,
          sql`now() - make_interval(secs => ${ENRICHMENT_TIMEOUT_MS / 1000})`
        )
      )
    )
  for (const item of stale) {
    killEnrichment(item.subprocessId)
    await markFailed(db, item.id, item.projectId)
  }
  return stale.length
}
