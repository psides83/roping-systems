export interface PortalApplication {
  id: string; producerName: string; producerSlug: string; kind: "application" | "renewal";
  status: "pending" | "approved" | "declined"; submittedAt: string; reviewedAt: string | null;
}
export interface PortalMembershipApplications {
  applications: PortalApplication[];
  forms: { producerName: string; producerSlug: string }[];
}
