"use server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
export async function acceptInvitation(_: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "Invalid invitation." };
  const db = await createClient();
  const result = await db.rpc("accept_staff_invitation",{target_invitation:id.data});
  if (result.error) return { error: result.error.message };
  (await cookies()).set("active_producer_id",result.data,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/"});
  redirect("/dashboard");
}
