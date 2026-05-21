-- Add the `backlog` value to card_status. We recreate the type instead of
-- `ALTER TYPE ... ADD VALUE` because drizzle runs all pending migrations in a
-- single transaction, and Postgres forbids using a value added via ADD VALUE
-- in the same transaction. A freshly CREATEd type has no such restriction, so
-- the data backfill in 0008 can reference 'backlog' right away.
ALTER TYPE "public"."card_status" RENAME TO "card_status_old";--> statement-breakpoint
CREATE TYPE "public"."card_status" AS ENUM('backlog', 'todo', 'in_progress', 'review', 'done', 'blocked');--> statement-breakpoint
ALTER TABLE "cards" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "cards" ALTER COLUMN "status" SET DATA TYPE "public"."card_status" USING "status"::text::"public"."card_status";--> statement-breakpoint
ALTER TABLE "cards" ALTER COLUMN "status" SET DEFAULT 'todo';--> statement-breakpoint
DROP TYPE "public"."card_status_old";
