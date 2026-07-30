/**
 * Serveur autonome de la Console — l'étape 6a de la transition desktop.
 *
 * Il expose exactement la même API que l'app Next, mais sans Next : c'est lui
 * que Tauri embarquera en sidecar, pendant que le front devient un SPA Vite.
 * Tout le métier (runner SSE, tunnel SSH, chiffrement AES, réconciliation)
 * est réutilisé sans modification depuis `apps/web/src/modules`.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { ROUTES, type RouteModule } from "./routes";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

/** Signature d'un route handler Next : (Request, { params: Promise<…> }). */
type NextHandler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Response | Promise<Response>;

const app = new Hono();

/**
 * Le SPA est servi depuis une autre origine en dev (Vite sur :1420), et depuis
 * `tauri://localhost` une fois empaqueté. On n'ouvre donc pas au monde : la
 * liste est explicite.
 */
app.use(
  "/api/*",
  cors({
    origin: (origin) =>
      origin === "http://localhost:1420" ||
      origin === "http://127.0.0.1:1420" ||
      origin.startsWith("tauri://")
        ? origin
        : null,
    credentials: true,
  }),
);

function mountRoute(path: string, module: RouteModule) {
  for (const method of HTTP_METHODS) {
    const handler = module[method];
    if (typeof handler !== "function") continue;

    app.on(method, path, (c) =>
      // Next livre `params` en promesse ; les handlers l'attendent tel quel.
      (handler as NextHandler)(c.req.raw, {
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

const port = Number(process.env.CONSOLE_SERVER_PORT ?? 3170);

export default { port, fetch: app.fetch, idleTimeout: 0 };
