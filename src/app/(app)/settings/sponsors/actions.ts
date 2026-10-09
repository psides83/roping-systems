"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { sponsorBucket, sponsorLogoExtension, sponsorLogoLimit, sponsorSchema } from "@/lib/producer-sponsors";

export type SponsorState = { success?: boolean; message?: string };
async function context() {
  const producer=await getActiveProducer();
  return producer && ["owner","admin"].includes(producer.role) ? {producer,db:await createClient()} : null;
}
function refresh(){ revalidatePath("/settings/sponsors");revalidatePath("/public","layout"); }

export async function saveSponsor(_state:SponsorState,form:FormData):Promise<SponsorState> {
  const parsed=sponsorSchema.safeParse(Object.fromEntries(form));
  if(!parsed.success) return {message:parsed.error.issues[0].message};
  const access=await context();
  if(!access) return {message:"Owner or administrator access is required."};
  const {db,producer}=access;const input=parsed.data;
  const current=await db.from("producer_sponsors").select("logo_path,revision").eq("id",input.id).eq("producer_id",producer.id).maybeSingle();
  if(current.error) return {message:"Unable to load this sponsor. Please try again."};
  if((current.data?.revision ?? 0)!==input.revision) return {message:"This sponsor changed. Close and reopen the editor before saving."};
  let uploaded:string|null=null;
  let path=form.get("removeLogo")==="on" ? null : current.data?.logo_path ?? null;
  const file=form.get("logo");
  if(file instanceof File && file.size>0) {
    if(file.size>sponsorLogoLimit) return {message:"Logo files must be 2 MB or smaller."};
    const extension=sponsorLogoExtension(file.type,new Uint8Array(await file.slice(0,12).arrayBuffer()),file.size);
    if(!extension) return {message:"Choose a valid PNG, JPEG, or WebP image."};
    uploaded=`${producer.id}/${input.id}/${crypto.randomUUID()}.${extension}`;
    const result=await db.storage.from(sponsorBucket).upload(uploaded,file,{contentType:file.type,cacheControl:"3600"});
    if(result.error) return {message:"Unable to upload the logo. Please try again."};
    path=uploaded;
  }
  const values={name:input.name,website_url:input.website,logo_path:path,sort_order:input.sortOrder,is_active:form.get("isActive")==="on",revision:input.revision+1};
  const query=current.data ? db.from("producer_sponsors").update(values).eq("id",input.id).eq("producer_id",producer.id).eq("revision",input.revision)
    : db.from("producer_sponsors").insert({id:input.id,producer_id:producer.id,...values});
  const saved=await query.select("id").maybeSingle();
  if(saved.error || !saved.data) {
    if(uploaded) await db.storage.from(sponsorBucket).remove([uploaded]);
    return {message:saved.error ? "Unable to save the sponsor. Please try again." : "This sponsor changed. Reopen the editor before saving."};
  }
  if(current.data?.logo_path && current.data.logo_path!==path) await db.storage.from(sponsorBucket).remove([current.data.logo_path]);
  refresh();return {success:true};
}
export async function deleteSponsor(id:string,revision:number):Promise<SponsorState> {
  if(!z.uuid().safeParse(id).success || !Number.isInteger(revision) || revision<1) return {message:"Choose a valid sponsor."};
  const access=await context();if(!access)return {message:"Owner or administrator access is required."};
  const {db,producer}=access;
  const removed=await db.from("producer_sponsors").delete().eq("id",id).eq("producer_id",producer.id).eq("revision",revision).select("logo_path").maybeSingle();
  if(removed.error || !removed.data) return {message:"Unable to remove this sponsor. Refresh the page and try again."};
  if(removed.data.logo_path) await db.storage.from(sponsorBucket).remove([removed.data.logo_path]);
  refresh();return {success:true};
}
