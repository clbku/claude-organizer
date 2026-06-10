CREATE TYPE "public"."card_run_status" AS ENUM('running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "card_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"card_id" text NOT NULL,
	"project_id" text NOT NULL,
	"status" "card_run_status" DEFAULT 'running' NOT NULL,
	"job_id" text,
	"worktree_path" text,
	"branch" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card_runs" ADD CONSTRAINT "card_runs_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_runs" ADD CONSTRAINT "card_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_runs_card_idx" ON "card_runs" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "card_runs_project_status_idx" ON "card_runs" USING btree ("project_id","status");