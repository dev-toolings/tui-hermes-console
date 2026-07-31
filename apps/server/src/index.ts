/**
 * Serveur de la Console.
 *
 * Il détient toute l'API et tout le métier : runner SSE, tunnel SSH,
 * chiffrement AES, réconciliation. Il sert aussi le SPA compilé, ce qui donne
 * un accès navigateur sans second process — et c'est ce même binaire que Tauri
 * embarque en sidecar.
 */

import { join } from "node:path";
import { stat } from "node:fs/promises";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { ROUTES, type RouteModule } from "./routes";
import { register } from "./instrumentation";
import { isAllowedOrigin } from "@/modules/api/origins";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

/**
 * Signature des handlers de `src/api/**` : (Request, { params: Promise<…> }).
 * Héritée de la convention Next, conservée parce que les 24 handlers l'utilisent
 * et qu'elle n'a rien de spécifique à Next — ce ne sont que des Request/Response.
 */
type RouteHandler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Response | Promise<Response>;

const app = new Hono();

/**
 * Le SPA est servi depuis une autre origine en dev (Vite sur :1420) et depuis
 * `tauri://localhost` une fois empaqueté. La liste vient de `origins.ts`, la
 * même que celle du garde anti-CSRF : deux listes divergentes autoriseraient en
 * CORS ce que le garde refuse.
 */
app.use(
  "/api/*",
  cors({
    origin: (origin, c) => (isAllowedOrigin(origin, c.req.raw) ? origin : null),
    credentials: true,
  }),
);

function mountRoute(path: string, module: RouteModule) {
  for (const method of HTTP_METHODS) {
    const handler = module[method];
    if (typeof handler !== "function") continue;

    app.on(method, path, (c) =>
      (handler as RouteHandler)(c.req.raw, {
        params: Promise.resolve(c.req.param() as Record<string, string>),
      }),
    );
  }
}

for (const route of ROUTES) mountRoute(route.path, route.module);

/** Inventaire des routes réellement montées — utile pour vérifier la parité. */
app.get("/__routes", (c) =>
  c.json({
    routes: ROUTES.flatMap((route) =>
      HTTP_METHODS.filter((method) => typeof route.module[method] === "function").map(
        (method) => `${method} ${route.path}`,
      ),
    ),
  }),
);

/**
 * Le SPA compilé, servi par le même process que l'API.
 *
 * Deux raisons de le faire ici plutôt que devant un serveur statique : le
 * navigateur retrouve la Console sans second process, et le sidecar Tauri sert
 * exactement les mêmes octets que la version web — un écart entre les deux
 * serait invisible jusqu'à la mise en production.
 *
 * En dev, `dist/` n'existe pas : Vite sert le SPA sur :1420 et proxifie `/api`
 * jusqu'ici. On ne monte donc rien plutôt que de répondre des 404 trompeurs.
 */
const spaDir = process.env.CONSOLE_SPA_DIR ?? join(import.meta.dir, "../../console/dist");
const spaIndex = join(spaDir, "index.html");
const hasSpa = await stat(spaIndex).then(
  () => true,
  () => false,
);

if (hasSpa) {
  app.get("/*", async (c) => {
    const path = c.req.path;
    // `/api` est déjà monté : si on arrive ici avec ce préfixe, c'est une route
    // inconnue. Renvoyer index.html donnerait un 200 avec du HTML à un client
    // qui attend du JSON — un bug bien plus dur à lire qu'un 404.
    if (path.startsWith("/api/")) return c.notFound();

    const asset = Bun.file(join(spaDir, path));
    if (path !== "/" && (await asset.exists())) {
      return new Response(asset);
    }
    // Toute autre URL est une route cliente : c'est le routeur du SPA qui
    // décidera, y compris de son propre écran 404.
    return new Response(Bun.file(spaIndex), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  });
}

// Un run laissé « en cours » par un arrêt brutal ne se terminerait jamais seul.
void register();

const port = Number(process.env.CONSOLE_SERVER_PORT ?? 3170);

console.info(
  `[hermes-console] API sur :${port}${hasSpa ? ` · SPA servi depuis ${spaDir}` : " · SPA non compilé (dev : Vite sur :1420)"}`,
);

export default { port, fetch: app.fetch, idleTimeout: 0 };
