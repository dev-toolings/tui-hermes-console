CREATE TABLE "hermes_releases" (
	"id" bigint PRIMARY KEY NOT NULL,
	"tag_name" text NOT NULL,
	"name" text,
	"body" text DEFAULT '' NOT NULL,
	"html_url" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"source_created_at" timestamp with time zone NOT NULL,
	"source_updated_at" timestamp with time zone NOT NULL,
	"prerelease" boolean DEFAULT false NOT NULL,
	"draft" boolean DEFAULT false NOT NULL,
	"note_count" integer DEFAULT 0 NOT NULL,
	"feature_count" integer DEFAULT 0 NOT NULL,
	"improvement_count" integer DEFAULT 0 NOT NULL,
	"suppression_count" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hermes_releases_tag_name_unique" UNIQUE("tag_name")
);
--> statement-breakpoint
CREATE INDEX "hermes_releases_published_at_idx" ON "hermes_releases" USING btree ("published_at");
