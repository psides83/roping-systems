export function producerAccessRole(role: string): "owner" | "admin" | "operator" | "viewer" {
  // Specialized roles get read-only access outside their explicitly authorized workspace.
  return role === "owner" || role === "admin" || role === "operator" ? role : "viewer";
}
