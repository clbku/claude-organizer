import { sql } from "drizzle-orm";
import type { Database } from "@claude-organizer/db";

export type CoEvent =
  | {
      type: "card.changed";
      projectId: string;
      cardId: string;
      cardKey?: string;
    }
  | {
      type: "card.deleted";
      projectId: string;
      cardId: string;
    }
  | {
      type: "comment.added";
      projectId: string;
      cardId: string;
      commentId: string;
    }
  | {
      type: "comment.updated";
      projectId: string;
      cardId: string;
      commentId: string;
    }
  | {
      type: "comment.deleted";
      projectId: string;
      cardId: string;
      commentId: string;
    }
  | {
      type: "comment.read";
      projectId: string;
      cardId: string;
    }
  | {
      type: "sprint.changed";
      projectId: string;
      sprintId: string;
    }
  | {
      type: "sprint.deleted";
      projectId: string;
      sprintId: string;
    }
  | {
      type: "doc.changed";
      projectId: string;
      docId: string;
    }
  | {
      type: "doc.deleted";
      projectId: string;
      docId: string;
    }
  | {
      type: "project.changed";
      projectId: string;
    };

export const EVENT_CHANNEL = "co_events";

export async function notify(db: Database, event: CoEvent): Promise<void> {
  const payload = JSON.stringify(event);
  await db.execute(
    sql`SELECT pg_notify(${EVENT_CHANNEL}, ${payload})`,
  );
}
