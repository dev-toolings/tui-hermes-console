export type SiteMembershipRole =
  | "admin"
  | "operator"
  | "requester"
  | "approver"
  | "auditor";

export type AuthSite = {
  id: string;
  name: string;
  slug: string;
  role: SiteMembershipRole;
};

export type AuthSiteContext = {
  activeSite: AuthSite | null;
  memberships: AuthSite[];
  selectionRequired: boolean;
  membershipRequired: boolean;
};

export type SiteAccessBlock = "membership" | "selection" | null;

export function siteAccessBlock(siteContext: AuthSiteContext | null | undefined): SiteAccessBlock {
  if (!siteContext || siteContext.membershipRequired) return "membership";
  if (siteContext.selectionRequired || !siteContext.activeSite) return "selection";
  return null;
}

export function selectSitePayload(siteId: string) {
  return { siteId };
}
