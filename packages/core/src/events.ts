import { sql } from 'drizzle-orm'

import type { Database } from '@claude-organizer/db'
import type { CoEvent } from '@claude-organizer/shared'

export type { CoEvent } from '@claude-organizer/shared'

export const EVENT_CHANNEL = 'co_events'

export async function notify(db: Database, event: CoEvent): Promise<void> {
  const payload = JSON.stringify(event)
  await db.execute(
    sql`SELECT pg_notify(${EVENT_CHANNEL}, ${payload})`
  )
}
