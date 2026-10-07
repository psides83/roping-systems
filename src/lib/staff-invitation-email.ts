export function staffInvitationEmail(producerName: string, role: string, siteUrl: string, expiresAt: string) {
  const url = new URL("/staff-invitations", siteUrl);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Invitation site URL must use HTTPS.");
  }
  const roles: Record<string, string> = { owner: "Producer Owner", admin: "Administrator", operator: "Operator", timing_staff: "Timing Staff", viewer: "Viewer" };
  return {
    subject: `Staff invitation: ${producerName.replace(/[\r\n]/g, " ")}`,
    text: `${producerName} has invited you to join Roping Systems as ${roles[role] ?? role}.\n\nSign in with this email address to accept your invitation:\n${url.toString()}\n\nIf you do not have an account, register and verify this email first.\n\nExpires: ${new Date(expiresAt).toISOString()}.\n\nIf you did not expect this invitation, you can ignore it.`,
  };
}
