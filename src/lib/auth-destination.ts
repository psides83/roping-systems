export function authDestination(value: unknown): string {
  return typeof value === "string" && ["/staff-invitations", "/dashboard", "/roper", "/roper/requests"].includes(value)
    ? value
    : "/dashboard";
}
