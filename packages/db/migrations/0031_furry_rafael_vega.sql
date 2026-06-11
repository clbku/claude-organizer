DROP INDEX "attachments_orphaned_idx";--> statement-breakpoint
CREATE INDEX "attachments_orphaned_idx" ON "attachments" USING btree ("orphaned_at") WHERE "attachments"."orphaned_at" is not null;