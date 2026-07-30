ALTER TABLE "threads" ADD COLUMN "source" text DEFAULT 'chat' NOT NULL;--> statement-breakpoint
UPDATE "threads" SET "source" = 'mission' WHERE "agent_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "threads_source_idx" ON "threads" USING btree ("source");
