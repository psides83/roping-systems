"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import {
  submitMembershipApplication,
  type MembershipApplicationState,
} from "@/app/public/[producerSlug]/membership/actions";
import {
  getStandardMembershipField,
  type CustomMembershipField,
  type CustomMembershipSection,
  type SelectedMembershipField,
} from "@/lib/membership-forms";
import { PhoneInput } from "@/components/ui/phone-input";
import { PrivateReceiptCode } from "./private-receipt-code";

const inputClass =
  "mt-2 block h-11 w-64 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm outline-none focus:border-[var(--brand-accent)]";

export function PublicMembershipForm({
  formId,
  standardFields,
  customSections,
  releaseText,
  requireSignature,
  initialResponses = {},
  renewal = false,
  membershipId,
}: {
  formId: string;
  standardFields: SelectedMembershipField[];
  customSections: CustomMembershipSection[];
  releaseText: string | null;
  requireSignature: boolean;
  initialResponses?: Record<string, string | boolean>;
  renewal?: boolean;
  portal?: boolean;
  membershipId?: string;
}) {
  const [state, action, pending] = useActionState<
    MembershipApplicationState,
    FormData
  >(submitMembershipApplication, {});
  useEffect(() => {
    if (state.receiptCode) {
      try { sessionStorage.setItem("membership-application-receipt", state.receiptCode); } catch { /* The displayed receipt remains available. */ }
    }
  }, [state.receiptCode]);

  if (state.success) {
    return (
      <div className="border-t border-[#e7ebe8] px-5 py-12 text-center sm:px-8">
        <CheckCircle2
          size={42}
          className="mx-auto text-emerald-700"
          strokeWidth={1.7}
        />
        <h2 className="mt-4 text-xl font-bold">{renewal ? "Renewal submitted" : "Application submitted"}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#66716b]">
          The producer can now review your application. Approval is required before your membership becomes active.
        </p>
        {state.receiptCode ? <div className="mx-auto mt-5 max-w-md space-y-3 text-left">
          <p className="text-sm text-[#66716b]">Keep this private receipt code. Sign in or create an account with the email on your application to link it and view its status. The code expires after 90 days.</p>
          <PrivateReceiptCode code={state.receiptCode} />
          <Link href="/auth/login?next=/roper/memberships" className="inline-flex h-10 items-center rounded-md brand-accent-fill px-4 text-sm font-semibold text-white">Sign in to link application</Link>
        </div> : <Link href="/roper/memberships" className="mt-4 inline-block text-sm font-semibold">View application status</Link>}
      </div>
    );
  }

  return (
    <form
      action={action}
      className="border-t border-[#e7ebe8] px-5 py-6 sm:px-8"
    >
      <input type="hidden" name="formId" value={formId} />
      {membershipId ? <input type="hidden" name="membershipId" value={membershipId} /> : null}
      <section>
        <h2 className="text-base font-bold">Member information</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {standardFields.map((selected) => {
            const field = getStandardMembershipField(selected.key);
            if (!field) return null;
            return (
              <MembershipField
                key={selected.key}
                name={`standard_${selected.key}`}
                label={field.label}
                type={field.type}
                options={field.options}
                required={selected.required}
                error={state.errors?.[`standard_${selected.key}`]}
                value={initialResponses[selected.key]}
              />
            );
          })}
        </div>
      </section>

      {customSections.map((section) => (
        <section
          key={section.id}
          className="mt-8 border-t border-[#e7ebe8] pt-6"
        >
          <h2 className="text-base font-bold">{section.title}</h2>
          {section.details ? (
            <p className="mt-1 text-sm leading-6 text-[#66716b]">
              {section.details}
            </p>
          ) : null}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {section.fields.map((field) => (
              <MembershipField
                key={field.id}
                name={`custom_${field.id}`}
                label={field.label}
                type={field.type}
                options={field.options}
                required={field.required}
                error={state.errors?.[`custom_${field.id}`]}
                value={initialResponses[`custom_${field.id}`]}
              />
            ))}
          </div>
        </section>
      ))}

      {releaseText ? (
        <section className="mt-8 border-t border-[#e7ebe8] pt-6">
          <h2 className="text-base font-bold">Release and acknowledgment</h2>
          <div className="mt-3 max-h-72 overflow-y-auto rounded-md border border-[#dfe4e1] bg-[#f7f8f7] p-4 text-sm leading-6 whitespace-pre-wrap text-[#4f5a54]">
            {releaseText}
          </div>
          <label className="mt-4 flex items-start gap-3 text-sm font-semibold">
            <input
              name="acceptedRelease"
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--brand-accent)]"
            />
            I have read and accept this release and acknowledgment.
          </label>
          {state.errors?.acceptedRelease ? (
            <p className="mt-1 text-xs font-semibold text-rose-700">Required</p>
          ) : null}
        </section>
      ) : null}

      {requireSignature ? (
        <section className="mt-6">
          <label className="block text-sm font-semibold">
            Legal name of signer <span className="text-rose-700">*</span>
            <input
              name="signatureName"
              autoCapitalize="words"
              className={inputClass}
              aria-invalid={Boolean(state.errors?.signatureName)}
            />
          </label>
          {state.errors?.signatureName ? (
            <p className="mt-1 text-xs font-semibold text-rose-700">Required</p>
          ) : null}
        </section>
      ) : null}

      {state.message ? (
        <p className="mt-5 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {state.message}
        </p>
      ) : null}
      <div className="mt-6 flex justify-end">
        <button
          disabled={pending}
          className="flex h-11 items-center gap-2 rounded-md brand-accent-fill px-5 text-sm font-bold text-white disabled:opacity-50"
        >
          {pending ? <LoaderCircle size={17} className="animate-spin" /> : null}
          {renewal ? "Submit renewal" : "Submit application"}
        </button>
      </div>
    </form>
  );
}

function MembershipField({
  name,
  label,
  type,
  options,
  required,
  error,
  value,
}: {
  name: string;
  label: string;
  type: CustomMembershipField["type"];
  options?: string[];
  required: boolean;
  error?: string;
  value?: string | boolean;
}) {
  if (type === "checkbox") {
    return (
      <label className="flex min-h-11 items-center gap-3 rounded-md border border-[#dfe4e1] px-3 text-sm font-semibold sm:col-span-2">
        <input
          name={name}
          type="checkbox"
          defaultChecked={value === true}
          className="h-4 w-4 accent-[var(--brand-accent)]"
        />
        {label}
        {required ? <span className="text-rose-700">*</span> : null}
        {error ? (
          <span className="ml-auto text-xs text-rose-700">Required</span>
        ) : null}
      </label>
    );
  }

  return (
    <label
      className={`text-sm font-semibold ${type === "textarea" ? "sm:col-span-2" : ""}`}
    >
      {label} {required ? <span className="text-rose-700">*</span> : null}
      {type === "select" ? (
        <select name={name} className={inputClass} defaultValue={typeof value === "string" ? value : ""}>
          <option value="">Select</option>
          {(options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : type === "textarea" ? (
        <textarea
          name={name}
          rows={4}
          defaultValue={typeof value === "string" ? value : ""}
          className="mt-2 w-full rounded-md border border-[#ccd4d0] bg-white p-3 text-sm outline-none focus:border-[var(--brand-accent)]"
        />
      ) : type === "phone" ? (
        <PhoneInput name={name} defaultValue={typeof value === "string" ? value : ""} className={inputClass} />
      ) : (
        <input
          name={name}
          type={type}
          defaultValue={typeof value === "string" ? value : ""}
          autoCapitalize={type === "text" ? "words" : undefined}
          className={inputClass}
          aria-invalid={Boolean(error)}
        />
      )}
      {error ? (
        <span className="mt-1 block text-xs font-semibold text-rose-700">
          {error}
        </span>
      ) : null}
    </label>
  );
}
