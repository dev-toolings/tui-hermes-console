-- L'application native est retirée du périmètre le 08-08-2026. La table
-- d'appairage n'a plus de client, et la session par jeton porteur qu'elle
-- alimentait est supprimée avec elle. La migration 0038 reste dans le journal :
-- une base déjà migrée doit pouvoir rejouer l'historique sans trou.
DROP TABLE IF EXISTS "console_mobile_pairings";
