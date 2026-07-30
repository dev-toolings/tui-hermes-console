ALTER TABLE "runs" ADD COLUMN "workdir" text;--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"direction" text NOT NULL,
	"filename" text NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" text,
	"size_bytes" integer NOT NULL,
	"checksum_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifacts_run_idx" ON "artifacts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "artifacts_run_direction_idx" ON "artifacts" USING btree ("run_id","direction");
