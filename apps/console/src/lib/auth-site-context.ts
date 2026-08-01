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
  organizationId: string;
  clientOrganizationId: string;
};

export type AuthSiteContext = {
  activeSite: AuthSite | null;
  memberships: AuthSite[];
  selectionRequired: boolean;
  membershipRequired: boolean;
  capabilities: string[];
  authorization?: {
    actorOrganizationId: string;
    clientOrganizationId: string;
    mandateId: string | null;
    projectId: string | null;
  } | null;
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
