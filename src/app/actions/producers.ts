"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getProducers } from "@/lib/producers";

export async function switchProducer(formData: FormData) {
  const producerId = String(formData.get("producerId") ?? "");
  const requestedPath = String(formData.get("returnTo") ?? "/dashboard");
  const producers = await getProducers();
  if (!producers.some((producer) => producer.id === producerId)) throw new Error("You do not have access to that producer.");

  const cookieStore = await cookies();
  cookieStore.set("active_producer_id", producerId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  redirect(requestedPath.startsWith("/") && !requestedPath.startsWith("//") ? requestedPath : "/dashboard");
}
