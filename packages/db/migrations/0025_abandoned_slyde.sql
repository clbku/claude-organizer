ALTER TABLE "card_attachments" RENAME TO "attachments";--> statement-breakpoint
ALTER TABLE "attachments" DROP CONSTRAINT "card_attachments_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "attachments" DROP CONSTRAINT "card_attachments_card_id_cards_id_fk";
--> statement-breakpoint
ALTER TABLE "attachments" DROP CONSTRAINT "card_attachments_intake_item_id_intake_items_id_fk";
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_intake_item_id_intake_items_id_fk" FOREIGN KEY ("intake_item_id") REFERENCES "public"."intake_items"("id") ON DELETE cascade ON UPDATE no action;