"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getOrganizations } from "@/lib/organizations";

export async function switchOrganization(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "");
  const requestedPath = String(formData.get("returnTo") ?? "/dashboard");
  const organizations = await getOrganizations();
  if (!organizations.some((organization) => organization.id === organizationId)) throw new Error("You do not have access to that organization.");

  const cookieStore = await cookies();
  cookieStore.set("active_organization_id", organizationId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  redirect(requestedPath.startsWith("/") && !requestedPath.startsWith("//") ? requestedPath : "/dashboard");
}
