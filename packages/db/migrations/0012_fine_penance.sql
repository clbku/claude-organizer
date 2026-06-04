CREATE TYPE "public"."intake_status" AS ENUM('pending', 'planned', 'archived');--> statement-breakpoint
CREATE TABLE "intake_items" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"body_md" text NOT NULL,
	"status" "intake_status" DEFAULT 'pending' NOT NULL,
	"planned_card_keys" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "intake_items" ADD CONSTRAINT "intake_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "intake_items_project_idx" ON "intake_items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "intake_items_status_idx" ON "intake_items" USING btree ("project_id","status");