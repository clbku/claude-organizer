DROP INDEX "attachments_owner_idx";--> statement-breakpoint
ALTER TABLE "attachments" DROP COLUMN "owner_type";--> statement-breakpoint
ALTER TABLE "attachments" DROP COLUMN "owner_id";