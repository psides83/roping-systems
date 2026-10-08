import Link from "next/link";
import { ClipboardList, ExternalLink } from "lucide-react";
import { ReviewMembershipApplication } from "@/components/members/review-membership-application";
import { ApplicationReceiptCode } from "@/components/members/application-receipt-code";
import {
  MembershipFormBuilder,
  type MembershipFormDraft,
} from "@/components/members/membership-form-builder";
import { PageHeader } from "@/components/ui/page-header";
import { ProducerSettingsTabs } from "@/components/settings/producer-settings-tabs";
import {
  getStandardMembershipField,
  type CustomMembershipSection,
  type SelectedMembershipField,
} from "@/lib/membership-forms";
import { getActiveProducer } from "@/lib/producers";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const defaultStandardFields: SelectedMembershipField[] = [
  { key: "first_name", required: true },
  { key: "last_name", required: true },
  { key: "birth_date", required: true },
  { key: "competition_gender", required: true },
  { key: "email", required: true },
  { key: "phone", required: true },
  { key: "street_address", required: true },
  { key: "city", required: true },
  { key: "state", required: true },
  { key: "postal_code", required: true },
];

interface MembershipApplication {
  id: string;
  applicant_name: string;
  applicant_email: string | null;
  responses: Record<string, unknown>;
  form_snapshot: {
    custom_sections?: CustomMembershipSection[];
    release_text?: string | null;
  };
  release_accepted: boolean;
  signature_name: string | null;
  status: "pending" | "approved" | "declined";
  review_note: string | null;
  submitted_at: string;
  membership_id: string | null;
  application_kind: string;
  applicant_user_id: string | null;
}

async function getMembershipFormData() {
  const producer = await getActiveProducer();
  if (!producer || !isSupabaseConfigured()) {
    return {
      producer,
      role: producer?.role ?? "viewer",
      form: null,
      applications: [] as MembershipApplication[],
      members: [] as { id: string; label: string }[],
      divisions: [] as { id: string; name: string; classifications: { id: string; name: string }[] }[],
    };
  }

  const supabase = await createClient();
  const [
    { data: form, error: formError },
    { data: applications, error: applicationError },
  ] = await Promise.all([
    supabase
      .from("membership_forms")
      .select(
        "title, introduction, publication_state, standard_fields, custom_sections, release_text, require_signature",
      )
      .eq("producer_id", producer.id)
      .maybeSingle(),
    supabase
      .from("membership_applications")
      .select(
        "id, applicant_name, applicant_email, responses, form_snapshot, release_accepted, signature_name, status, review_note, submitted_at, membership_id, application_kind, applicant_user_id",
      )
      .eq("producer_id", producer.id)
      .order("submitted_at", { ascending: false }),
  ]);

  if (formError || applicationError) {
    throw new Error(
      `Unable to load membership forms: ${formError?.message ?? applicationError?.message}`,
    );
  }
  const { data: memberRows, error: memberError } = await supabase.from("memberships").select("id,member_number,ropers(first_name,last_name)").eq("producer_id", producer.id).order("member_number");
  if (memberError) throw new Error("Unable to load membership review records.");
  const { data: classifications, error: classError } = await supabase.from("classifications").select("id,name,division_id,divisions(name)").eq("producer_id", producer.id).eq("is_active", true).eq("eligibility_type", "skill").order("rank", { ascending: false });
  if (classError) throw new Error("Unable to load membership classification choices.");
  const divisions = new Map<string, { id: string; name: string; classifications: { id: string; name: string }[] }>();
  for (const c of classifications ?? []) {
    const group: { id: string; name: string; classifications: { id: string; name: string }[] } = divisions.get(c.division_id) ?? { id: c.division_id, name: (c.divisions as unknown as { name: string }).name, classifications: [] };
    group.classifications.push({ id: c.id, name: c.name }); divisions.set(c.division_id, group);
  }

  return {
    producer,
    role: producer.role,
    form,
    applications: (applications ?? []) as MembershipApplication[],
    divisions: [...divisions.values()],
    members: (memberRows ?? []).map((m) => { const r = m.ropers as unknown as { first_name: string; last_name: string }; return { id: m.id, label: `#${m.member_number} · ${r.first_name} ${r.last_name}` }; }),
  };
}

function displayResponse(key: string, value: unknown) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function responseLabel(application: MembershipApplication, key: string) {
  const standardLabel = getStandardMembershipField(key)?.label;
  if (standardLabel) return standardLabel;
  const customId = key.startsWith("custom_") ? key.slice(7) : null;
  const customField = application.form_snapshot.custom_sections
    ?.flatMap((section) => section.fields)
    .find((field) => field.id === customId);
  return customField?.label ?? key.replaceAll("_", " ");
}

export default async function MembershipFormSettingsPage() {
  const data = await getMembershipFormData();
  const enabled = Boolean(data.producer && data.role !== "viewer");
  const initial: MembershipFormDraft = {
    title: data.form?.title ?? "Membership Application",
    introduction: data.form?.introduction ?? "",
    publicationState:
      (data.form
        ?.publication_state as MembershipFormDraft["publicationState"]) ??
      "draft",
    standardFields:
      (data.form?.standard_fields as unknown as SelectedMembershipField[]) ??
      defaultStandardFields,
    customSections:
      (data.form?.custom_sections as unknown as CustomMembershipSection[]) ??
      [],
    releaseText: data.form?.release_text ?? "",
    requireSignature: data.form?.require_signature ?? true,
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Producer setup"
        title="Membership form"
        description="Build the online application your members complete, including producer-specific questions and release language."
        actions={
          data.producer && initial.publicationState === "published" ? (
            <Link
              href={`/public/${data.producer.slug}/membership`}
              target="_blank"
              className="flex h-10 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-4 text-sm font-semibold"
            >
              View public form <ExternalLink size={15} />
            </Link>
          ) : null
        }
      />
      <ProducerSettingsTabs active="membership" />
      {enabled ? (
        <MembershipFormBuilder initial={initial} />
      ) : (
        <p className="rounded-md border border-[#dfe4e1] bg-white p-5 text-sm text-[#66716b]">
          Manager access is required to edit the membership form.
        </p>
      )}

      <section className="rounded-md border border-[#dfe4e1] bg-white">
        <header className="flex items-center gap-3 border-b border-[#e7ebe8] px-5 py-4">
          <ClipboardList
            size={19}
            className="text-[var(--brand-accent-strong)]"
          />
          <div>
            <h2 className="font-bold">Submitted applications</h2>
            <p className="mt-1 text-xs text-[#758078]">
              Review applications without losing the originally submitted
              details.
            </p>
          </div>
        </header>
        <div className="divide-y divide-[#edf0ee]">
          {data.applications.map((application) => (
            <details key={application.id} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">
                    {application.applicant_name}
                  </p>
                  <p className="mt-1 text-xs text-[#758078]">
                    {application.applicant_email ?? "No email provided"} ·{" "}
                    {new Intl.DateTimeFormat("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(application.submitted_at))}
                  </p>
                </div>
                <span
                  className={`rounded-md px-2.5 py-1 text-[11px] font-bold capitalize ${
                    application.status === "approved"
                      ? "bg-emerald-50 text-emerald-700"
                      : application.status === "declined"
                        ? "bg-rose-50 text-rose-700"
                        : "bg-amber-50 text-amber-800"
                  }`}
                >
                  {application.status}
                </span>
              </summary>
              <div className="mt-5 border-t border-[#edf0ee] pt-4">
                <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(application.responses).map(([key, value]) => (
                    <div key={key}>
                      <dt className="text-[11px] font-bold uppercase text-[#758078]">
                        {responseLabel(application, key)}
                      </dt>
                      <dd className="mt-1 text-sm font-semibold">
                        {displayResponse(key, value)}
                      </dd>
                    </div>
                  ))}
                  {application.signature_name ? (
                    <div>
                      <dt className="text-[11px] font-bold uppercase text-[#758078]">
                        Signed by
                      </dt>
                      <dd className="mt-1 text-sm font-semibold">
                        {application.signature_name}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-[11px] font-bold uppercase text-[#758078]">
                      Release accepted
                    </dt>
                    <dd className="mt-1 text-sm font-semibold">
                      {application.release_accepted ? "Yes" : "No"}
                    </dd>
                  </div>
                </dl>
                {application.form_snapshot.release_text ? (
                  <details className="mt-5 rounded-md border border-[#dfe4e1] bg-[#f7f8f7] p-3">
                    <summary className="cursor-pointer text-xs font-bold">
                      Release in effect when submitted
                    </summary>
                    <p className="mt-3 text-xs leading-6 whitespace-pre-wrap text-[#526058]">
                      {application.form_snapshot.release_text}
                    </p>
                  </details>
                ) : null}
                {enabled && application.status === "pending" ? (
                  <ReviewMembershipApplication id={application.id} kind={application.application_kind} membershipId={application.membership_id} members={data.members} responses={application.responses} divisions={data.divisions} />
                ) : application.review_note ? (
                  <p className="mt-4 text-xs text-[#66716b]">
                    Review note: {application.review_note}
                  </p>
                ) : null}
                {enabled && !application.applicant_user_id && application.status !== "declined" && <ApplicationReceiptCode applicationId={application.id} />}
              </div>
            </details>
          ))}
          {!data.applications.length ? (
            <p className="px-5 py-8 text-center text-sm text-[#758078]">
              No membership applications have been submitted.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
