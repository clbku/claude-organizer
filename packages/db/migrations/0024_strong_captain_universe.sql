DROP INDEX "card_attachments_card_idx";--> statement-breakpoint
ALTER TABLE "card_attachments" ALTER COLUMN "card_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "card_attachments" ADD COLUMN "project_id" text;--> statement-breakpoint
UPDATE "card_attachments" a SET "project_id" = c."project_id" FROM "cards" c WHERE a."card_id" = c."id";--> statement-breakpoint
ALTER TABLE "card_attachments" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "card_attachments" ADD COLUMN "intake_item_id" text;--> statement-breakpoint
ALTER TABLE "card_attachments" ADD CONSTRAINT "card_attachments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_attachments" ADD CONSTRAINT "card_attachments_intake_item_id_intake_items_id_fk" FOREIGN KEY ("intake_item_id") REFERENCES "public"."intake_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_card_idx" ON "card_attachments" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "attachments_intake_idx" ON "card_attachments" USING btree ("intake_item_id");--> statement-breakpoint
CREATE INDEX "attachments_project_idx" ON "card_attachments" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "card_attachments" ADD CONSTRAINT "attachments_owner_check" CHECK (NOT ("card_id" IS NOT NULL AND "intake_item_id" IS NOT NULL));