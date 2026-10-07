export function authDestination(value: unknown): string {
  return typeof value === "string" && ["/staff-invitations", "/dashboard", "/roper"].includes(value)
    ? value
    : "/dashboard";
}
