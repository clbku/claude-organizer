ALTER TABLE "sprints" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN "archived_at" timestamp with time zone;