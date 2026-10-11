export function authDestination(value: unknown): string {
  return typeof value === "string" && ["/platform", "/staff-invitations", "/dashboard", "/roper", "/roper/requests", "/roper/memberships"].includes(value)
    ? value
    : "/dashboard";
}
