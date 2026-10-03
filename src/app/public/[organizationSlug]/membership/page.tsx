import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PublicMembershipForm } from "@/components/members/public-membership-form";
import {
  type CustomMembershipSection,
  type SelectedMembershipField,
} from "@/lib/membership-forms";
import { getBrandStyle } from "@/lib/branding";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

export default async function PublicMembershipPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const supabase = await createClient();
  const { data: form, error } = await supabase
    .from("public_membership_forms")
    .select(
      "id, organization_name, logo_path, brand_primary, brand_accent, title, introduction, standard_fields, custom_sections, release_text, require_signature",
    )
    .eq("organization_slug", organizationSlug)
    .maybeSingle();
  if (error || !form) notFound();

  const logoUrl = form.logo_path
    ? supabase.storage.from("organization-logos").getPublicUrl(form.logo_path)
        .data.publicUrl
    : null;

  return (
    <main
      style={getBrandStyle(form.brand_primary, form.brand_accent)}
      className="min-h-screen bg-[#f5f6f7]"
    >
      <header className="brand-primary-fill text-white">
        <div className="mx-auto flex h-20 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href={`/public/${organizationSlug}`}
            className="flex min-w-0 items-center gap-3"
          >
            {logoUrl ? (
              <span className="grid h-11 w-14 shrink-0 place-items-center overflow-hidden rounded-md bg-white p-1">
                <Image
                  src={logoUrl}
                  alt={`${form.organization_name} logo`}
                  width={48}
                  height={36}
                  unoptimized
                  className="h-full w-full object-contain"
                />
              </span>
            ) : null}
            <span className="truncate font-bold">{form.organization_name}</span>
          </Link>
          <Link
            href={`/public/${organizationSlug}`}
            className="flex shrink-0 items-center gap-2 text-xs font-semibold brand-muted brand-hover"
          >
            <ArrowLeft size={15} /> Events
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <section className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white">
          <div className="px-5 py-6 sm:px-8 sm:py-8">
            <p className="text-xs font-bold uppercase text-[var(--brand-accent-strong)]">
              Online membership
            </p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
              {form.title}
            </h1>
            {form.introduction ? (
              <p className="mt-3 max-w-2xl text-sm leading-6 whitespace-pre-wrap text-[#66716b]">
                {form.introduction}
              </p>
            ) : null}
          </div>
          <PublicMembershipForm
            formId={form.id}
            standardFields={
              form.standard_fields as unknown as SelectedMembershipField[]
            }
            customSections={
              form.custom_sections as unknown as CustomMembershipSection[]
            }
            releaseText={form.release_text}
            requireSignature={form.require_signature}
          />
        </section>
      </div>
    </main>
  );
}
