/**
 * Primitives de navigation, façon `next/link` + `next/navigation`.
 *
 * Next est parti, TanStack Router l'a remplacé. Plutôt que de réécrire les
 * ~30 sites d'appel répartis dans les composants, on garde ici la forme d'API
 * qu'ils utilisaient déjà : `<Link href>`, `useRouter().push()`,
 * `usePathname()`. Le portage se réduit alors à changer la source de l'import.
 *
 * Ce n'est pas une couche de compatibilité perpétuelle : c'est la frontière où
 * l'on traduit une intention de navigation en appel TanStack, à un seul
 * endroit. Si un jour l'API TanStack est adoptée partout, ce fichier disparaît.
 */
import { useMemo } from "react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import {
  Link as RouterLink,
  useNavigate,
  useRouter as useTanStackRouter,
  useRouterState,
} from "@tanstack/react-router";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  children?: ReactNode;
};

/**
 * `to` de TanStack est typé contre l'arbre de routes ; nos href sont des
 * chaînes construites à l'exécution (`/runs/${id}`). Le cast est assumé et
 * confiné ici — une route inexistante se voit au clic, pas à la compilation.
 */
export function Link({ href, children, ...rest }: LinkProps) {
  return (
    <RouterLink to={href as never} {...rest}>
      {children}
    </RouterLink>
  );
}

export default Link;

export type AppRouter = {
  push: (href: string) => void;
  replace: (href: string) => void;
  back: () => void;
  refresh: () => void;
};

export function useRouter(): AppRouter {
  const navigate = useNavigate();
  const router = useTanStackRouter();

  return useMemo(
    () => ({
      push: (href) => void navigate({ to: href as never }),
      replace: (href) => void navigate({ to: href as never, replace: true }),
      back: () => void router.history.back(),
      /**
       * `router.refresh()` de Next re-jouait le rendu serveur. Ici l'équivalent
       * est d'invalider les loaders : les routes montées rechargent leurs
       * données, ce que les appelants attendent après une mutation.
       */
      refresh: () => void router.invalidate(),
    }),
    [navigate, router],
  );
}

export function usePathname(): string {
  return useRouterState({ select: (state) => state.location.pathname });
}

/**
 * Équivalent de `useSelectedLayoutSegment` de Next, à une différence près : la
 * base est explicite. Next la déduisait de la position du fichier layout ;
 * TanStack n'a pas cette notion, et la deviner serait plus fragile que la dire.
 *
 * `/chat` → null · `/chat/new` → "new" · `/chat/abc` → "abc"
 */
export function useSelectedLayoutSegment(basePath: string): string | null {
  const pathname = usePathname();
  if (!pathname.startsWith(basePath)) return null;
  const rest = pathname.slice(basePath.length).replace(/^\//, "");
  if (!rest) return null;
  return rest.split("/")[0] ?? null;
}
