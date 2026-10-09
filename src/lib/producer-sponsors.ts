import { z } from "zod";

export const sponsorBucket = "sponsor-logos";
export const sponsorLogoLimit = 2 * 1024 * 1024;
export const sponsorSchema = z.object({
  id: z.uuid(), revision: z.coerce.number().int().min(0), name: z.string().trim().min(1,"Enter the sponsor name.").max(120),
  website: z.string().trim().max(2000).refine(value => {
    if (!value) return true;
    try { const url = new URL(value); return ["https:","http:"].includes(url.protocol) && !url.username && !url.password; }
    catch { return false; }
  },"Use a full http or https website address.").transform(value=>value ? new URL(value).href : ""),
  sortOrder: z.coerce.number().int().min(1).max(10000),
});
export interface ProducerSponsor {
  id: string; name: string; website_url: string; logo_path: string|null;
  sort_order: number; is_active: boolean; revision: number;
}
export function sponsorLogoExtension(type: string, bytes: Uint8Array, size: number) {
  if(size<=0 || size>sponsorLogoLimit) return null;
  const matches=(offset:number,signature:number[])=>signature.every((value,index)=>bytes[offset+index]===value);
  if(type==="image/png" && matches(0,[137,80,78,71,13,10,26,10])) return "png";
  if(type==="image/jpeg" && matches(0,[255,216,255])) return "jpg";
  if(type==="image/webp" && matches(0,[82,73,70,70]) && matches(8,[87,69,66,80])) return "webp";
  return null;
}
