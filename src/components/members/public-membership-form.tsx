"use client";

import { PublicFormFeedback, PublicFormConfirmation } from "@/components/ui/public-form-feedback";
import { PersistentForm } from "@/components/ui/persistent-form";
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
  "mt-2 block h-11 w-full min-w-0 rounded-md border border-[#ccd4d0] bg-white px-3 text-base outline-none focus:border-[var(--brand-accent)]";

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
  >(async (previous, data) => {
    try { return await submitMembershipApplication(previous, data); }
    catch { return { message: "We could not confirm your submission. Check your application status before trying again, or contact the producer." }; }
  }, {});
  useEffect(() => {
    if (state.receiptCode) {
      try { sessionStorage.setItem("membership-application-receipt", state.receiptCode); } catch { /* The displayed receipt remains available. */ }
    }
  }, [state.receiptCode]);

  if (state.success) {
    return (
      <PublicFormConfirmation className="border-t border-[#e7ebe8] px-5 py-12 text-center sm:px-8">
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
          <Link href="/auth/login?next=/roper/memberships" className="inline-flex min-h-11 items-center rounded-md brand-accent-fill px-4 text-sm font-semibold text-white">Sign in to link application</Link>
        </div> : <Link href="/roper/memberships" className="mt-4 inline-block text-sm font-semibold">View application status</Link>}
      </PublicFormConfirmation>
    );
  }

  return (
    <PersistentForm
      action={action}
      aria-busy={pending}
      className="border-t border-[#e7ebe8] px-5 py-6 sm:px-8"
    >
      <input type="hidden" name="formId" value={formId} />
      {membershipId ? <input type="hidden" name="membershipId" value={membershipId} /> : null}
      <p className="mb-5 text-sm text-[#66716b]">Fields marked * are required. The producer reviews your application before activating membership.</p>
      <PublicFormFeedback submission={state} message={state.message} errors={Object.entries(state.errors ?? {}).map(([name, message]) => ({ name, message, label: name === "acceptedRelease" ? "Release acknowledgment" : name === "signatureName" ? "Legal name of signer" : name.startsWith("standard_") ? getStandardMembershipField(name.slice(9))?.label ?? "Member information" : customSections.flatMap(section => section.fields).find(field => `custom_${field.id}` === name)?.label ?? "Additional information" }))} />
      {state.message && <Link href="/roper/memberships" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold underline">Check application status</Link>}
      <section className="mt-5">
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
              required
              aria-invalid={Boolean(state.errors?.acceptedRelease)}
              aria-describedby={state.errors?.acceptedRelease ? "acceptedRelease-error" : undefined}
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--brand-accent)]"
            />
            I have read and accept this release and acknowledgment.
          </label>
          {state.errors?.acceptedRelease ? (
            <p id="acceptedRelease-error" className="mt-1 text-xs font-semibold text-rose-700">Accept the release to continue.</p>
          ) : null}
        </section>
      ) : null}

      {requireSignature ? (
        <section className="mt-6">
          <label className="block text-sm font-semibold">
            Legal name of signer <span className="text-rose-700">*</span>
            <input
              name="signatureName"
              required
              autoComplete="name"
              aria-describedby={state.errors?.signatureName ? "signatureName-error" : undefined}
              autoCapitalize="words"
              className={inputClass}
              aria-invalid={Boolean(state.errors?.signatureName)}
            />
          </label>
          {state.errors?.signatureName ? (
            <p id="signatureName-error" className="mt-1 text-xs font-semibold text-rose-700">Enter the legal name of the signer.</p>
          ) : null}
        </section>
      ) : null}

      <p role="status" className="sr-only">{pending ? "Submitting application. Please wait." : ""}</p>
      <div className="mt-6 flex justify-end">
        <button
          disabled={pending}
          className="flex h-11 items-center gap-2 rounded-md brand-accent-fill px-5 text-sm font-bold text-white disabled:opacity-50"
        >
          {pending ? <LoaderCircle size={17} className="animate-spin" /> : null}
          {pending ? "Submitting…" : renewal ? "Submit renewal" : "Submit application"}
        </button>
      </div>
    </PersistentForm>
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
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${name}-error` : undefined}
          type="checkbox"
          defaultChecked={value === true}
          className="h-4 w-4 accent-[var(--brand-accent)]"
        />
        {label}
        {required ? <span className="text-rose-700">*</span> : null}
        {error ? (
          <span id={`${name}-error`} className="ml-auto text-xs text-rose-700">Required</span>
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
        <select required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${name}-error` : undefined} name={name} className={inputClass} defaultValue={typeof value === "string" ? value : ""}>
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
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${name}-error` : undefined}
          rows={4}
          defaultValue={typeof value === "string" ? value : ""}
          className="mt-2 w-full rounded-md border border-[#ccd4d0] bg-white p-3 text-base outline-none focus:border-[var(--brand-accent)]"
        />
      ) : type === "phone" ? (
        <PhoneInput required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${name}-error` : undefined} name={name} defaultValue={typeof value === "string" ? value : ""} className={inputClass} />
      ) : (
        <input
          name={name}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${name}-error` : undefined}
          type={type}
          defaultValue={typeof value === "string" ? value : ""}
          autoCapitalize={type === "text" ? "words" : undefined}
          className={inputClass}
        />
      )}
      {error ? (
        <span id={`${name}-error`} className="mt-1 block text-xs font-semibold text-rose-700">
          {error}
        </span>
      ) : null}
    </label>
  );
}
