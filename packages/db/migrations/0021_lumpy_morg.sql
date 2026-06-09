ALTER TYPE "public"."intake_status" ADD VALUE 'enriching' BEFORE 'planned';--> statement-breakpoint
ALTER TYPE "public"."intake_status" ADD VALUE 'enriched' BEFORE 'planned';--> statement-breakpoint
ALTER TABLE "intake_items" ADD COLUMN "enriched_body_md" text;--> statement-breakpoint
ALTER TABLE "intake_items" ADD COLUMN "context_notes_md" text;--> statement-breakpoint
ALTER TABLE "intake_items" ADD COLUMN "draft_plan_md" text;--> statement-breakpoint
ALTER TABLE "intake_items" ADD COLUMN "enriched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "intake_items" ADD COLUMN "subprocess_id" text;