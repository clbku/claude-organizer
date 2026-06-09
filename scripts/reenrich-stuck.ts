// One-off: re-run enrichment for inbox items left stuck by the pre-fix crash.
// Runs the real production path (spawnEnrichment) inside a container that has the
// claude CLI + mounted host credentials. Polls until every item reaches a
// terminal state, then exits.
import { spawnEnrichment } from '@claude-organizer/core'
import { createDb, schema } from '@claude-organizer/db'
import { inArray, sql } from 'drizzle-orm'

async function main() {
  const ids = process.argv.slice(2)
  if (ids.length === 0) {
    console.error('usage: tsx reenrich-stuck.ts <itk_id> [<itk_id> ...]')
    process.exit(1)
  }

  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL not set')
  const { db, close } = createDb({ url })

  const items = await db
    .select()
    .from(schema.intakeItems)
    .where(inArray(schema.intakeItems.id, ids))

  for (const it of items) {
    await db
      .update(schema.intakeItems)
      .set({ status: 'enriching', subprocessId: null, updatedAt: sql`now()` })
      .where(inArray(schema.intakeItems.id, [it.id]))
    await spawnEnrichment(db, { id: it.id, projectId: it.projectId, bodyMd: it.bodyMd })
    console.log(`spawned enrichment for ${it.id} (${it.projectId})`)
  }

  for (;;) {
    const rows = await db
      .select({ id: schema.intakeItems.id, status: schema.intakeItems.status })
      .from(schema.intakeItems)
      .where(inArray(schema.intakeItems.id, ids))
    console.log('status:', rows.map(r => `${r.id}=${r.status}`).join('  '))
    if (!rows.some(r => r.status === 'enriching')) break
    await new Promise(r => setTimeout(r, 5000))
  }

  await close()
  console.log('done')
  process.exit(0)
}

void main()
