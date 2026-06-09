import { spawn } from 'child_process'
import { eq, sql } from 'drizzle-orm'

import { type Database, schema } from '@claude-organizer/db'

import { notify } from './events'

// In-memory registry: alive within one API process lifetime
const running = new Map<string, import('child_process').ChildProcess>()

function buildPrompt(bodyMd: string): string {
  return `You are enriching a software demand captured in a project inbox. You have access to bash and file reading tools to briefly explore the codebase for context if needed.

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

export function killEnrichment(subprocessId: string | null) {
  if (!subprocessId) return
  const proc = running.get(subprocessId)
  if (proc) {
    proc.kill('SIGTERM')
    running.delete(subprocessId)
    return
  }
  // Fallback for PIDs not in the registry (e.g. after a hot-reload)
  try {
    process.kill(parseInt(subprocessId, 10), 'SIGTERM')
  } catch {
    // Process already gone — fine
  }
}

export async function spawnEnrichment(
  db: Database,
  item: { id: string, projectId: string, bodyMd: string }
) {
  // Prompt via stdin: avoids process-table exposure and OS arg-length limits
  const proc = spawn('claude', ['-p', '--model', 'claude-sonnet-4-6'], {
    stdio: ['pipe', 'pipe', 'inherit']
  })

  // A spawn failure (e.g. the claude binary is missing) surfaces as an async
  // 'error' event on the child and its stdin pipe. An unhandled one is rethrown
  // by Node and crashes the whole API; catch both and just mark the item failed.
  proc.on('error', () => {
    void markFailed(db, item.id, item.projectId)
  })
  proc.stdin?.on('error', () => {})

  proc.stdin?.end(buildPrompt(item.bodyMd))

  if (!proc.pid) {
    await markFailed(db, item.id, item.projectId)
    return
  }

  const subprocessId = String(proc.pid)
  running.set(subprocessId, proc)

  let stdout = ''
  proc.stdout?.on('data', (chunk: Buffer) => {
    stdout += chunk.toString()
  })

  // Buffer the close event so it can't fire before the DB write below completes.
  // If the process exits instantly (e.g. spawn error), we replay it after the write.
  let pendingCloseCode: number | null | undefined
  proc.on('close', (code) => {
    pendingCloseCode = code ?? null
  })

  await db
    .update(schema.intakeItems)
    .set({ subprocessId, updatedAt: sql`now()` })
    .where(eq(schema.intakeItems.id, item.id))

  const handleClose = async (code: number | null) => {
    running.delete(subprocessId)

    const [current] = await db
      .select({ subprocessId: schema.intakeItems.subprocessId })
      .from(schema.intakeItems)
      .where(eq(schema.intakeItems.id, item.id))
      .limit(1)

    // Bail if superseded by a newer spawn (re-edit) or item was deleted
    if (!current || current.subprocessId !== subprocessId) return

    if (code === 0) {
      try {
        const text = stdout.trim()
        // The agentic CLI often wraps the JSON in prose ("Now I have enough
        // context…") or markdown fences despite the prompt, so extract the
        // outermost { … } object instead of requiring the whole output to parse.
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

  if (pendingCloseCode !== undefined) {
    // Already closed before the DB write finished — replay now
    await handleClose(pendingCloseCode)
  } else {
    proc.removeAllListeners('close')
    proc.on('close', handleClose)
  }
}
