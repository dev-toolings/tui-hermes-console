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
import {
  ROUTES,
  ROUTE_METHODS,
  type RouteDefinition,
} from "./routes";
import { register } from "./instrumentation";
import { isAllowedOrigin } from "@/modules/api/origins";
import { apiErrorResponse } from "@/modules/api/errors";
import {
  assertCsrf,
  AuthError,
  getSession,
  requireSiteRequestContext,
  type SiteRequestContext,
} from "@/modules/auth/service";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import { consoleSetupRequired } from "@/modules/setup/service";
import {
  isAiRunStartRequest,
  runStartPreconditionResponse,
} from "@/modules/setup/ai-disclosure";
import {
  assertSiteAction,
  denyInstallationAccess,
} from "@/modules/auth/site-authorization";

/**
 * Signature des handlers de `src/api/**` : (Request, { params: Promise<…> }).
 * Héritée de la convention Next, conservée parce que les 24 handlers l'utilisent
 * et qu'elle n'a rien de spécifique à Next — ce ne sont que des Request/Response.
 */
type RouteHandler = (
  request: Request,
  context: {
    params: Promise<Record<string, string>>;
    siteContext: SiteRequestContext | null;
  },
) => Response | Promise<Response>;

const app = new Hono<{
  Variables: { siteContext: SiteRequestContext | null };
}>();

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

const PUBLIC_API_PATHS = new Set(["/api/healthz", "/api/readyz", "/api/auth"]);
const SETUP_API_PATHS = new Set(["/api/setup", "/api/runtime", "/api/runtime/test", "/api/agents"]);

/**
 * La garde est centrale : une nouvelle route produit est protégée dès son
 * montage, au lieu de dépendre d'un oubli éventuel dans son handler.
 */
app.use("/api/*", async (c, next) => {
  if (c.req.method === "OPTIONS" || PUBLIC_API_PATHS.has(c.req.path)) return next();

  try {
    const session = await getSession(c.req.raw);
    if (!session) {
      return c.json({ error: { code: "AUTH_REQUIRED", message: "Authentification requise." } }, 401);
    }
    c.set("siteContext", requireSiteRequestContext(session));
    if (!["GET", "HEAD"].includes(c.req.method)) {
      assertSameOriginMutation(c.req.raw);
      assertCsrf(c.req.raw, session);
    }
    const setupRequired = await consoleSetupRequired();
    if (isAiRunStartRequest(c.req.method, c.req.path)) {
      const precondition = runStartPreconditionResponse(setupRequired, session);
      if (precondition) return precondition;
    }
    if (setupRequired && !SETUP_API_PATHS.has(c.req.path)) {
      return c.json(
        { error: { code: "SETUP_REQUIRED", message: "La configuration initiale doit être terminée." } },
        423,
      );
    }
    return next();
  } catch (error) {
    if (error instanceof AuthError) return apiErrorResponse(error);
    console.error("Authentication middleware failed", error);
    return c.json({ error: { code: "AUTH_UNAVAILABLE", message: "Authentification indisponible." } }, 503);
  }
});

function mountRoute(route: RouteDefinition) {
  for (const method of ROUTE_METHODS) {
    const handler = route.module[method];
    if (typeof handler !== "function") continue;
    const action =
      route.access.boundary === "site" ? route.access.actions[method] : undefined;
    if (route.access.boundary === "site" && !action) {
      throw new Error(`SITE_ACTION_MISSING:${method} ${route.path}`);
    }

    app.on(method, route.path, async (c) => {
      try {
        const siteContext = c.get("siteContext") ?? null;
        if (action) {
          if (!siteContext) {
            throw new AuthError(
              "Le contexte de site est indisponible.",
              503,
              "SITE_CONTEXT_UNAVAILABLE",
            );
          }
          await assertSiteAction(siteContext, action);
        }
        if (route.access.boundary === "installation") {
          if (!siteContext) {
            throw new AuthError(
              "Le contexte de site est indisponible.",
              503,
              "SITE_CONTEXT_UNAVAILABLE",
            );
          }
          await denyInstallationAccess(siteContext, method, route.path);
        }
        return await (handler as RouteHandler)(c.req.raw, {
          params: Promise.resolve(c.req.param() as Record<string, string>),
          siteContext,
        });
      } catch (error) {
        return apiErrorResponse(error);
      }
    });
  }
}

for (const route of ROUTES) mountRoute(route);

/** Inventaire des routes réellement montées — utile pour vérifier la parité. */
app.get("/__routes", (c) =>
  c.json({
    routes: ROUTES.flatMap((route) =>
      ROUTE_METHODS.filter((method) => typeof route.module[method] === "function").map(
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
const hostname = process.env.CONSOLE_SERVER_HOST ?? "127.0.0.1";

console.info(
  `[hermes-console] API sur ${hostname}:${port}${hasSpa ? ` · SPA servi depuis ${spaDir}` : " · SPA non compilé (dev : Vite sur :1420)"}`,
);

export default { hostname, port, fetch: app.fetch, idleTimeout: 0 };
