-- Backlog is now its own card status. Cards that were "parked" (no sprint, in
-- `todo`) move to `backlog`. Cards already in flight (in_progress/review/done)
-- or attached to a sprint keep their status. Runs in its own migration so the
-- `backlog` enum value added in 0007 is already committed (Postgres forbids
-- using a freshly-added enum value in the same transaction).
UPDATE "cards" SET "status" = 'backlog'
WHERE "sprint_id" IS NULL AND "status" = 'todo';
