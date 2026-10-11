"use client";

import { PersistentForm } from "@/components/ui/persistent-form";
import Image from "next/image";
import { useActionState,useEffect,useRef,useState,useTransition } from "react";
import { ImagePlus,LoaderCircle,Pencil,Plus,Trash2,Upload,X } from "lucide-react";
import { deleteSponsor,saveSponsor,type SponsorState } from "@/app/(app)/settings/sponsors/actions";
import { NumberStepper } from "@/components/ui/number-stepper";
import { sponsorLogoLimit,type ProducerSponsor } from "@/lib/producer-sponsors";

type Sponsor=ProducerSponsor & {logoUrl:string|null};
export function SponsorManager({sponsors}:{sponsors:Sponsor[]}){
  const [editing,setEditing]=useState<Sponsor|"new"|null>(null);
  const [error,setError]=useState("");const [pending,startTransition]=useTransition();
  return <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">{sponsors.length} {sponsors.length===1?"sponsor":"sponsors"}</h2><button type="button" onClick={()=>setEditing("new")} className="flex h-10 items-center gap-2 rounded-md brand-accent-fill px-3 text-sm font-semibold text-white"><Plus size={16}/>Add sponsor</button></div>
    {error && <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <div className="divide-y border-y">{sponsors.map(sponsor=><article key={sponsor.id} className="flex flex-wrap items-center gap-4 py-4">
      <div className="grid h-20 w-28 shrink-0 place-items-center rounded-md border bg-white p-2">{sponsor.logoUrl?<Image src={sponsor.logoUrl} alt={`${sponsor.name} logo`} width={112} height={80} unoptimized className="h-full w-full object-contain"/>:<ImagePlus size={25} className="text-[#758078]"/>}</div>
      <div className="min-w-0 flex-1"><h3 className="break-words font-semibold">{sponsor.name}</h3><p className="mt-1 text-xs text-[#66716b]">Position {sponsor.sort_order} · {sponsor.is_active?"Public":"Hidden"}</p>{sponsor.website_url && <a href={sponsor.website_url} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-sm text-[#66716b] hover:underline">{sponsor.website_url}</a>}</div>
      <div className="flex gap-2"><button type="button" onClick={()=>setEditing(sponsor)} title="Edit sponsor" aria-label={`Edit ${sponsor.name}`} className="grid h-11 w-11 place-items-center rounded-md border bg-white"><Pencil size={17}/></button><button type="button" disabled={pending} title="Remove sponsor" aria-label={`Remove ${sponsor.name}`} onClick={()=>{
        if(!window.confirm(`Remove ${sponsor.name} from your sponsor list?`))return;
        setError("");startTransition(async()=>{try{const result=await deleteSponsor(sponsor.id,sponsor.revision);setError(result.message ?? "");}catch{setError("Unable to remove the sponsor. Please try again.");}});
      }} className="grid h-11 w-11 place-items-center rounded-md border bg-white text-rose-700 disabled:opacity-40">{pending?<LoaderCircle size={17} className="animate-spin"/>:<Trash2 size={17}/>}</button></div>
    </article>)}</div>
    {!sponsors.length && <p className="py-6 text-sm text-[#66716b]">No sponsors added yet.</p>}
    {editing && <SponsorForm key={editing==="new"?"new":editing.id} sponsor={editing==="new"?undefined:editing} nextOrder={Math.min(10000,Math.max(0,...sponsors.map(s=>s.sort_order))+1)} close={()=>setEditing(null)}/>}
  </section>;
}
function SponsorForm({sponsor,nextOrder,close}:{sponsor?:Sponsor;nextOrder:number;close:()=>void}){
  const ref=useRef<HTMLDialogElement>(null);const closeRef=useRef(close);
  const [id]=useState(()=>sponsor?.id ?? crypto.randomUUID());
  const [state,action,pending]=useActionState<SponsorState,FormData>(saveSponsor,{});
  const [preview,setPreview]=useState(sponsor?.logoUrl ?? null);
  const [fileError,setFileError]=useState("");
  const objectUrl=useRef<string|null>(null);
  useEffect(()=>{closeRef.current=close;},[close]);
  useEffect(()=>{ref.current?.showModal();const previous=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{document.body.style.overflow=previous;if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);};},[]);
  useEffect(()=>{if(state.success)closeRef.current();},[state.success]);
  const field="mt-1 h-11 w-64 max-w-full rounded-md border bg-white px-3 text-sm font-normal";
  return <dialog ref={ref} aria-label={sponsor?"Edit sponsor":"Add sponsor"} onCancel={e=>{if(pending)e.preventDefault();else close();}} className="m-auto max-h-[90svh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-md border bg-white p-5 text-[#17201c] shadow-xl backdrop:bg-black/45">
    <header className="mb-5 flex items-center justify-between gap-3"><h2 className="text-lg font-bold">{sponsor?"Edit sponsor":"Add sponsor"}</h2><button type="button" disabled={pending} onClick={close} title="Close" aria-label="Close" className="grid h-11 w-11 place-items-center rounded-md hover:bg-[#f1f3f2]"><X size={20}/></button></header>
    <PersistentForm action={action} className="space-y-5"><input type="hidden" name="id" value={id}/><input type="hidden" name="revision" value={sponsor?.revision ?? 0}/><fieldset disabled={pending} className="min-w-0 space-y-4">
      <label className="grid justify-items-start text-sm font-semibold">Sponsor name<input name="name" required maxLength={120} defaultValue={sponsor?.name} className={field}/></label>
      <label className="grid justify-items-start text-sm font-semibold">Website<input name="website" type="url" maxLength={2000} placeholder="https://example.com" defaultValue={sponsor?.website_url} className={field}/></label>
      <div className="flex flex-wrap items-center gap-4"><div className="grid h-24 w-36 shrink-0 place-items-center rounded-md border bg-[#f7f8f7] p-2">{preview?<Image src={preview} alt="Sponsor logo preview" width={144} height={96} unoptimized className="h-full w-full object-contain"/>:<ImagePlus size={26} className="text-[#758078]"/>}</div><div className="min-w-0"><label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-semibold"><Upload size={16}/>Choose logo<input name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={e=>{
        const file=e.target.files?.[0];setFileError("");
        if(file && (file.size>sponsorLogoLimit || !["image/png","image/jpeg","image/webp"].includes(file.type))){setFileError("Choose a PNG, JPEG or WebP image up to 2 MB.");e.target.value="";return;}
        if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);
        objectUrl.current=file?URL.createObjectURL(file):null;setPreview(objectUrl.current ?? sponsor?.logoUrl ?? null);
      }}/></label><p className="mt-2 text-xs text-[#66716b]">PNG, JPEG or WebP · Up to 2 MB</p>{sponsor?.logoUrl && <label className="mt-2 flex min-h-10 items-center gap-2 text-sm"><input name="removeLogo" type="checkbox"/>Remove current logo</label>}</div></div>
      <label className="grid justify-items-start gap-1 text-sm font-semibold">Display position<NumberStepper label="Display position" name="sortOrder" min={1} max={10000} defaultValue={sponsor?.sort_order ?? nextOrder} className="h-11 w-44"/></label>
      <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input name="isActive" type="checkbox" defaultChecked={sponsor?.is_active ?? true}/>Show on public pages</label>
    </fieldset>
    {(fileError || state.message) && <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-800">{fileError || state.message}</p>}
    <footer className="flex justify-end gap-2 border-t pt-4"><button type="button" disabled={pending} onClick={close} className="h-11 rounded-md border px-4 text-sm font-semibold">Cancel</button><button disabled={pending||Boolean(fileError)} className="inline-flex h-11 items-center gap-2 rounded-md brand-accent-fill px-4 text-sm font-semibold text-white disabled:opacity-40">{pending && <LoaderCircle size={16} className="animate-spin"/>}{pending?"Saving…":"Save sponsor"}</button></footer>
    </PersistentForm>
  </dialog>;
}
