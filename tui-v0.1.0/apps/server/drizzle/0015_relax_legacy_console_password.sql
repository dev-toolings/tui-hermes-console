-- Le compte historique utilisait password_hash obligatoire. Les nouvelles
-- identités Google n'en possèdent pas, tout en conservant le compte legacy.
-- Une installation neuve créée par 0011 n'a jamais eu cette colonne : la
-- migration doit donc converger aussi bien depuis le schéma legacy que depuis
-- le schéma Google courant, sans ALTER sur une colonne absente.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'console_users'
      AND column_name = 'password_hash'
  ) THEN
    ALTER TABLE "console_users" ALTER COLUMN "password_hash" DROP NOT NULL;
  END IF;
END
$$;
