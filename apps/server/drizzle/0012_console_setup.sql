CREATE TABLE "console_setup" (
  "id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
  "step" text DEFAULT 'runtime' NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
