-- Corrects the 0030 backfill against the final link model (CO-292):
--
-- (1) Docs keep their links through archive (archiveDoc never unlinks — only
-- destroy reclaims), but 0030 scanned only active bodies, so an archived doc's
-- attachment got no link. Add the missing archived-doc links (FK-safe).
INSERT INTO "attachment_links" ("attachment_id", "item_type", "item_id")
SELECT DISTINCT (m.match)[1] AS attachment_id, 'doc'::"attachment_owner_type", d.id
FROM "docs" d
CROSS JOIN LATERAL regexp_matches(d.body_md, 'att_[0-9a-z]{12}', 'g') AS m(match)
JOIN "attachments" a ON a.id = (m.match)[1]
WHERE d.archived_at IS NOT NULL AND strpos(coalesce(d.body_md, ''), 'att_') > 0
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- (2) orphaned_at must mark only attachments referenced by NO body at all. 0030
-- armed the clock on every link-less attachment, which wrongly includes archive
-- orphans (referenced solely by an archived card/comment/inbox) — those must
-- stay restorable byte-null rows invisible to the sweep (orphaned_at NULL). Clear
-- the clock for any attachment still cited by some body, active or archived.
UPDATE "attachments"
SET "orphaned_at" = NULL
WHERE "orphaned_at" IS NOT NULL
  AND "id" IN (
    SELECT (m.match)[1]
    FROM (
      SELECT description_md AS body FROM "cards" WHERE strpos(coalesce(description_md, ''), 'att_') > 0
      UNION ALL
      SELECT body_md FROM "comments" WHERE strpos(coalesce(body_md, ''), 'att_') > 0
      UNION ALL
      SELECT body_md FROM "docs" WHERE strpos(coalesce(body_md, ''), 'att_') > 0
      UNION ALL
      SELECT body_md FROM "intake_items" WHERE strpos(coalesce(body_md, ''), 'att_') > 0
    ) src
    CROSS JOIN LATERAL regexp_matches(src.body, 'att_[0-9a-z]{12}', 'g') AS m(match)
  );
