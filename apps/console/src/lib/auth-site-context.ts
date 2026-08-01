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

export type AuthMandate = {
  id: string;
  operatorOrganizationId: string;
  projectId: string | null;
  startsAt: string;
  expiresAt: string | null;
};

export type AuthSiteContext = {
  activeSite: AuthSite | null;
  memberships: AuthSite[];
  selectionRequired: boolean;
  membershipRequired: boolean;
  mandateSelectionRequired: boolean;
  mandates: AuthMandate[];
  capabilities: string[];
  authorization?: {
    actorOrganizationId: string;
    clientOrganizationId: string;
    mandateId: string | null;
    projectId: string | null;
  } | null;
};

export type SiteAccessBlock = "membership" | "selection" | "mandate" | null;

export function siteAccessBlock(siteContext: AuthSiteContext | null | undefined): SiteAccessBlock {
  if (!siteContext || siteContext.membershipRequired) return "membership";
  if (siteContext.selectionRequired || !siteContext.activeSite) return "selection";
  if (siteContext.mandateSelectionRequired) return "mandate";
  return null;
}

export function selectSitePayload(siteId: string) {
  return { siteId };
}

export function selectMandatePayload(mandateId: string) {
  return { mandateId };
}
