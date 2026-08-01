import type { SiteRequestContext } from "@/modules/auth/service";

export type AuthenticatedRouteContext<Params extends Record<string, string> = Record<string, string>> = {
  params: Promise<Params>;
  siteContext: SiteRequestContext;
};
