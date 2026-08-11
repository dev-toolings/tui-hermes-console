CREATE TABLE IF NOT EXISTS "connectors" (
  "id" text PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "label" text NOT NULL,
  "email" text NOT NULL,
  "imap_host" text NOT NULL,
  "imap_port" integer DEFAULT 993 NOT NULL,
  "encrypted_password" text NOT NULL,
  "last_test_status" text DEFAULT 'unknown' NOT NULL,
  "last_tested_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "connectors_type_idx" ON "connectors" USING btree ("type");
