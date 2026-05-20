ALTER TABLE "cards" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_parent_id_cards_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cards_parent_idx" ON "cards" USING btree ("parent_id");