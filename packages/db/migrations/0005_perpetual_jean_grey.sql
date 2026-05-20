CREATE TABLE "card_blockers" (
	"blocked_card_id" text NOT NULL,
	"blocker_card_id" text NOT NULL,
	CONSTRAINT "card_blockers_blocked_card_id_blocker_card_id_pk" PRIMARY KEY("blocked_card_id","blocker_card_id")
);
--> statement-breakpoint
ALTER TABLE "card_blockers" ADD CONSTRAINT "card_blockers_blocked_card_id_cards_id_fk" FOREIGN KEY ("blocked_card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_blockers" ADD CONSTRAINT "card_blockers_blocker_card_id_cards_id_fk" FOREIGN KEY ("blocker_card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_blockers_blocker_idx" ON "card_blockers" USING btree ("blocker_card_id");