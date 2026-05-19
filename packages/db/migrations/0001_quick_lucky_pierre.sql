-- 1. Add columns as nullable so backfill can run
ALTER TABLE "projects" ADD COLUMN "key_prefix" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "next_key_seq" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "key" text;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "summary" text;--> statement-breakpoint

-- 2. Backfill projects.key_prefix: first 4 alphanumeric chars of slug, uppercase.
--    User can refine via update_project_key_prefix MCP tool.
UPDATE "projects"
SET "key_prefix" = UPPER(LEFT(REGEXP_REPLACE("slug", '[^a-zA-Z0-9]', '', 'g'), 4))
WHERE "key_prefix" IS NULL;--> statement-breakpoint

UPDATE "projects" SET "key_prefix" = 'PROJ' WHERE "key_prefix" IS NULL OR "key_prefix" = '';--> statement-breakpoint

-- 3. Backfill cards.key: sequential per project, ordered by created_at
WITH numbered AS (
  SELECT
    c.id,
    c.project_id,
    ROW_NUMBER() OVER (PARTITION BY c.project_id ORDER BY c.created_at, c.id) AS seq
  FROM "cards" c
)
UPDATE "cards" c
SET "key" = p."key_prefix" || '-' || n.seq
FROM numbered n
JOIN "projects" p ON p.id = n.project_id
WHERE c.id = n.id;--> statement-breakpoint

-- 4. Update projects.next_key_seq based on backfilled cards
UPDATE "projects" p
SET "next_key_seq" = COALESCE(
  (SELECT COUNT(*) FROM "cards" WHERE project_id = p.id),
  0
) + 1;--> statement-breakpoint

-- 5. Enforce NOT NULL after data is consistent
ALTER TABLE "projects" ALTER COLUMN "key_prefix" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ALTER COLUMN "key" SET NOT NULL;--> statement-breakpoint

-- 6. Unique constraint per project
CREATE UNIQUE INDEX "cards_project_key_uk" ON "cards" USING btree ("project_id","key");
