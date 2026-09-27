"use client";

import Image from "next/image";
import { useActionState, useEffect, useRef, useState } from "react";
import { ImagePlus, LoaderCircle, Trash2, Upload } from "lucide-react";
import { removeOrganizationLogo, uploadOrganizationLogo, type OrganizationLogoState } from "@/app/(app)/settings/actions";

export function OrganizationLogoForm({ organizationName, logoUrl, canEdit, readOnlyMessage }: { organizationName: string; logoUrl: string | null; canEdit: boolean; readOnlyMessage: string }) {
  const [uploadState, uploadAction, uploading] = useActionState<OrganizationLogoState, FormData>(uploadOrganizationLogo, {});
  const [removeState, removeAction, removing] = useActionState<OrganizationLogoState, FormData>(removeOrganizationLogo, {});
  const [previewUrl, setPreviewUrl] = useState(logoUrl);
  const [hasFile, setHasFile] = useState(false);
  const objectUrl = useRef<string | null>(null);

  useEffect(() => () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  }, []);

  function previewFile(file?: File) {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = file ? URL.createObjectURL(file) : null;
    setPreviewUrl(objectUrl.current ?? logoUrl);
    setHasFile(Boolean(file));
  }

  const message = uploadState.message ?? removeState.message;
  const succeeded = uploadState.success ?? removeState.success;

  return <div className="mb-6 border-b border-[#e7ebe8] pb-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div className="grid h-24 w-32 shrink-0 place-items-center overflow-hidden rounded-md border border-[#dfe4e1] bg-[#f7f8f7] p-2">{previewUrl ? <Image src={previewUrl} alt={`${organizationName} logo`} width={112} height={80} unoptimized className="h-full w-full object-contain" /> : <ImagePlus size={28} className="text-[#9aa39e]" />}</div><div className="min-w-0 flex-1"><h3 className="text-sm font-bold">Organization logo</h3><p className="mt-1 text-xs leading-5 text-[#758078]">Shown on public schedules and results. Use a PNG, JPEG, or WebP image up to 2 MB.</p>{canEdit ? <div className="mt-3 flex flex-wrap gap-2"><form action={uploadAction} encType="multipart/form-data" className="flex gap-2"><label htmlFor="organization-logo" className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-xs font-semibold hover:bg-[#f7f8f7]"><Upload size={15} /> Choose image</label><input id="organization-logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => previewFile(event.target.files?.[0])} /><button disabled={!hasFile || uploading} className="flex h-9 items-center gap-2 rounded-md brand-primary-fill px-3 text-xs font-semibold text-white disabled:opacity-40">{uploading ? <LoaderCircle size={15} className="animate-spin" /> : <Upload size={15} />} Upload</button></form>{logoUrl ? <form action={removeAction}><button disabled={removing} className="grid h-9 w-9 place-items-center rounded-md border border-[#e1c5be] text-[var(--brand-accent-strong)] hover:bg-[#fff7f5] disabled:opacity-40" aria-label="Remove organization logo" title="Remove logo">{removing ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}</button></form> : null}</div> : <p className="mt-3 text-xs text-[#758078]">{readOnlyMessage}</p>}</div></div>{message ? <p className={`mt-3 rounded-md border p-3 text-sm ${succeeded ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{message}</p> : null}</div>;
}
