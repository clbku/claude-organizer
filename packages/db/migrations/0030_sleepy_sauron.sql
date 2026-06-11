CREATE TABLE "attachment_links" (
	"attachment_id" text NOT NULL,
	"item_type" "attachment_owner_type" NOT NULL,
	"item_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachment_links_attachment_id_item_type_item_id_pk" PRIMARY KEY("attachment_id","item_type","item_id")
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "orphaned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attachment_links" ADD CONSTRAINT "attachment_links_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachment_links_item_idx" ON "attachment_links" USING btree ("item_type","item_id");--> statement-breakpoint
CREATE INDEX "attachments_orphaned_idx" ON "attachments" USING btree ("orphaned_at");--> statement-breakpoint
-- Backfill the derived link index from the current ACTIVE bodies (one-time scan;
-- reconcile-on-write keeps it current afterwards). Only tokens resolving to an
-- existing attachment are linked (dangling refs skipped, so the FK never trips);
-- DISTINCT collapses a token cited twice in one body. `att_[0-9a-z]{12}` mirrors
-- the attachmentIdsInBody token regex.
INSERT INTO "attachment_links" ("attachment_id", "item_type", "item_id")
SELECT DISTINCT (m.match)[1] AS attachment_id, src.item_type::"attachment_owner_type", src.item_id
FROM (
  SELECT 'card'::text AS item_type, c.id AS item_id, c.description_md AS body
  FROM "cards" c
  WHERE c.archived_at IS NULL AND strpos(coalesce(c.description_md, ''), 'att_') > 0
  UNION ALL
  SELECT 'comment', cm.id, cm.body_md
  FROM "comments" cm
  JOIN "cards" c2 ON cm.card_id = c2.id
  WHERE c2.archived_at IS NULL AND strpos(coalesce(cm.body_md, ''), 'att_') > 0
  UNION ALL
  SELECT 'doc', d.id, d.body_md
  FROM "docs" d
  WHERE d.archived_at IS NULL AND strpos(coalesce(d.body_md, ''), 'att_') > 0
  UNION ALL
  SELECT 'inbox', it.id, it.body_md
  FROM "intake_items" it
  WHERE it.status <> 'archived' AND strpos(coalesce(it.body_md, ''), 'att_') > 0
) src
CROSS JOIN LATERAL regexp_matches(src.body, 'att_[0-9a-z]{12}', 'g') AS m(match)
JOIN "attachments" a ON a.id = (m.match)[1]
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Start the grace clock for every attachment with no link after the backfill
-- (pre-existing orphans and archived-only references).
UPDATE "attachments"
SET "orphaned_at" = now()
WHERE "id" NOT IN (SELECT "attachment_id" FROM "attachment_links");