"use client";
import { PersistentForm } from "@/components/ui/persistent-form";
import { FinalsMoveDecision } from "./finals-move-decision";

import { useActionState, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Pencil, X } from "lucide-react";
import {
  updateMember,
  type MemberProfileFormState,
} from "@/app/(app)/members/[membershipId]/actions";
import { PhoneInput } from "@/components/ui/phone-input";
import { useProducerFeatures } from "@/components/settings/producer-features-context";
import { featureEnabled } from "@/lib/producer-features";
import { blocksMoveBack, type MoveBackProgress } from "@/lib/classification-move-back";
import { MoveBackFeedback } from "./move-back-feedback";
import type {
  MemberProfileField,
  MemberProfileSection,
} from "@/lib/membership-forms";

interface DisciplineOption {
  id: string;
  name: string;
  classifications: Array<{ id: string; name: string }>;
}

export interface EditableMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate: string | null;
  competitionGender: "female" | "male" | null;
  memberNumber: string;
  status: "active" | "pending" | "expired" | "inactive";
  joinedOn: string | null;
  expiresOn: string | null;
  notes: string;
  profileFields: Record<string, string | boolean>;
}

const initialState: MemberProfileFormState = {};
const inputClass =
  "mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3 outline-none focus:border-[var(--brand-accent)]";

function today() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function EditMemberDialog({
  member,
  divisions,
  currentClassifications,
  profileSections,
  enabled,
  moveBackProgress = [],
}: {
  member: EditableMember;
  divisions: DisciplineOption[];
  currentClassifications: Record<string, string>;
  profileSections: MemberProfileSection[];
  enabled: boolean;
  moveBackProgress?: MoveBackProgress[];
}) {
  const [open, setOpen] = useState(false);
  const requireMemberships = featureEnabled(useProducerFeatures(), "require_memberships");
  const [classifications, setClassifications] = useState(
    currentClassifications,
  );
  const [state, action, pending] = useActionState(updateMember, initialState);
  const classificationChanges = useMemo(
    () =>
      JSON.stringify(
        divisions.map((discipline) => ({
          disciplineId: discipline.id,
          classificationId: classifications[discipline.id] ?? "",
        })),
      ),
    [classifications, divisions],
  );
  const hasClassificationChanges = divisions.some(
    (discipline) =>
      (classifications[discipline.id] ?? "") !==
      (currentClassifications[discipline.id] ?? ""),
  );
  const formMessage =
    state.message ?? Object.values(state.errors ?? {}).flat()[0];
  const blocked = moveBackProgress.some((p) => blocksMoveBack(p, classifications[p.divisionId] ?? ""));

  useEffect(() => {
    if (!state.success) return;
    const timeoutId = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [state]);

  return (
    <>
      <button
        type="button"
        disabled={!enabled}
        onClick={() => {
          setClassifications(currentClassifications);
          setOpen(true);
        }}
        className="flex h-10 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        <Pencil size={16} /> Edit member
      </button>
      {open ? (
        <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-black/45 p-4">
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0"
            onClick={() => setOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-member-title"
            className="relative my-8 w-full max-w-3xl rounded-md bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between border-b border-[#e1e6e3] p-5">
              <div>
                <h2 id="edit-member-title" className="text-lg font-bold">
                  Edit member
                </h2>
                <p className="mt-1 text-sm text-[#66716b]">
                  Update the member record and current classifications. Class
                  changes remain in the history below.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid h-9 w-9 place-items-center rounded-md hover:bg-[#f0f2f1]"
              >
                <X size={18} />
              </button>
            </header>
            <PersistentForm action={action} className="space-y-5 p-5">
              <input type="hidden" name="membershipId" value={member.id} />
              <input
                type="hidden"
                name="classificationChanges"
                value={classificationChanges}
              />
              <section>
                <h3 className="text-sm font-bold">Contact information</h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field
                    label="First name"
                    name="firstName"
                    value={member.firstName}
                    required
                  />
                  <Field
                    label="Last name"
                    name="lastName"
                    value={member.lastName}
                    required
                  />
                  <Field
                    label="Email"
                    name="email"
                    value={member.email}
                    type="email"
                  />
                  <Field
                    label="Phone"
                    name="phone"
                    value={member.phone}
                    type="tel"
                  />
                  <Field
                    label="Birth date"
                    name="birthDate"
                    value={member.birthDate ?? ""}
                    type="date"
                  />
                  <label className="block text-sm font-semibold">
                    Competition gender
                    <select
                      name="competitionGender"
                      defaultValue={member.competitionGender ?? ""}
                      className={inputClass}
                      required
                    >
                      <option value="" disabled>
                        Select gender
                      </option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                    </select>
                  </label>
                </div>
              </section>
              {profileSections.map((section) => (
                <section
                  key={section.id}
                  className="border-t border-[#e7ebe8] pt-5"
                >
                  <h3 className="text-sm font-bold">{section.title}</h3>
                  {section.details ? (
                    <p className="mt-1 text-xs leading-5 text-[#66716b]">
                      {section.details}
                    </p>
                  ) : null}
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    {section.fields.map((field) => (
                      <ProfileField
                        key={field.key}
                        field={field}
                        value={member.profileFields[field.key]}
                        error={state.errors?.[`profileField:${field.key}`]?.[0]}
                      />
                    ))}
                  </div>
                </section>
              ))}
              <section className="border-t border-[#e7ebe8] pt-5">
                <h3 className="text-sm font-bold">{requireMemberships ? "Membership" : "Roper record"}</h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field
                    label={requireMemberships ? "Member number" : "Roper number"}
                    name="memberNumber"
                    value={member.memberNumber}
                    required
                  />
                  {requireMemberships ? <label className="block text-sm font-semibold">
                    Status
                    <select
                      name="status"
                      defaultValue={member.status}
                      className={inputClass}
                    >
                      <option value="active">Active</option>
                      <option value="pending">Pending</option>
                      <option value="inactive">Inactive</option>
                      <option value="expired">Expired</option>
                    </select>
                  </label> : <input type="hidden" name="status" value={member.status} />}
                  <Field
                    label="Joined date"
                    name="joinedOn"
                    value={member.joinedOn ?? ""}
                    type="date"
                  />
                  {requireMemberships ? <Field
                    label="Expiration date"
                    name="expiresOn"
                    value={member.expiresOn ?? ""}
                    type="date"
                  /> : <input type="hidden" name="expiresOn" value={member.expiresOn ?? ""} />}
                </div>
                <label className="mt-4 block text-sm font-semibold">
                  Notes
                  <textarea
                    name="notes"
                    defaultValue={member.notes}
                    className="mt-2 min-h-20 w-full rounded-md border border-[#ccd4d0] p-3 outline-none focus:border-[var(--brand-accent)]"
                  />
                </label>
              </section>
              <section className="border-t border-[#e7ebe8] pt-5">
                <h3 className="text-sm font-bold">Current classifications</h3>
                <p className="mt-1 text-xs leading-5 text-[#66716b]">
                  Changing or removing a class closes the current assignment and
                  preserves it in classification history.
                </p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {divisions.map((discipline) => (
                    <label
                      key={discipline.id}
                      className="block text-sm font-semibold"
                    >
                      {discipline.name}
                      <select
                        value={classifications[discipline.id] ?? ""}
                        onChange={(event) =>
                          setClassifications((current) => ({
                            ...current,
                            [discipline.id]: event.target.value,
                          }))
                        }
                        className={inputClass}
                      >
                        <option value="">Unclassified</option>
                        {discipline.classifications.map((classification) => (
                          <option
                            key={classification.id}
                            value={classification.id}
                          >
                            {classification.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <div className="mt-3 space-y-2">{moveBackProgress.map((p) => <MoveBackFeedback key={p.assignmentId} progress={p} targetId={classifications[p.divisionId] ?? ""} memberId={member.id} onNavigate={() => setOpen(false)} />)}</div>
                {hasClassificationChanges && <div className="mt-3"><FinalsMoveDecision /></div>}
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Class change effective date"
                    name="classificationEffectiveOn"
                    value={today()}
                    type="date"
                    required
                  />
                  <label className="block text-sm font-semibold">
                    Class change reason
                    <input
                      name="classificationReason"
                      className={inputClass}
                      placeholder="Annual review, appeal, producer decision..."
                      required={hasClassificationChanges}
                    />
                  </label>
                </div>
              </section>
              {formMessage ? (
                <p
                  className={`rounded-md border p-3 text-sm ${state.success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}
                >
                  {formMessage}
                </p>
              ) : null}
              <div className="flex justify-end gap-2 border-t border-[#e7ebe8] pt-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-10 rounded-md border border-[#ccd4d0] px-4 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  disabled={pending || blocked}
                  className="flex h-10 items-center gap-2 rounded-md brand-accent-fill px-4 text-sm font-bold text-white disabled:opacity-50"
                >
                  {pending ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : null}
                  Save changes
                </button>
              </div>
            </PersistentForm>
          </section>
        </div>
      ) : null}
    </>
  );
}

function Field({
  label,
  name,
  value,
  type = "text",
  required = false,
}: {
  label: string;
  name: string;
  value: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      {type === "tel" ? (
        <PhoneInput
          name={name}
          defaultValue={value}
          required={required}
          className={inputClass}
        />
      ) : (
        <input
          name={name}
          type={type}
          defaultValue={value}
          required={required}
          className={inputClass}
        />
      )}
    </label>
  );
}

function ProfileField({
  field,
  value,
  error,
}: {
  field: MemberProfileField;
  value: string | boolean | undefined;
  error?: string;
}) {
  const name = `profileField:${field.key}`;
  if (field.type === "checkbox") {
    return (
      <label className="flex min-h-11 items-center gap-3 rounded-md border border-[#dfe4e1] px-3 text-sm font-semibold sm:col-span-2">
        <input type="hidden" name={name} value="false" />
        <input
          name={name}
          type="checkbox"
          value="true"
          defaultChecked={value === true}
          required={field.required}
          className="h-4 w-4 accent-[var(--brand-accent)]"
        />
        <span>
          {field.label}
          {field.required ? <span className="text-rose-700"> *</span> : null}
        </span>
        {error ? (
          <span className="ml-auto text-xs text-rose-700">{error}</span>
        ) : null}
      </label>
    );
  }

  const stringValue = typeof value === "string" ? value : "";
  return (
    <label
      className={`block text-sm font-semibold ${field.type === "textarea" ? "sm:col-span-2" : ""}`}
    >
      {field.label}
      {field.required ? <span className="text-rose-700"> *</span> : null}
      {field.type === "select" ? (
        <select
          name={name}
          defaultValue={stringValue}
          required={field.required}
          className={inputClass}
        >
          <option value="">Select</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : field.type === "textarea" ? (
        <textarea
          name={name}
          defaultValue={stringValue}
          required={field.required}
          rows={4}
          className="mt-2 w-full rounded-md border border-[#ccd4d0] bg-white p-3 outline-none focus:border-[var(--brand-accent)]"
        />
      ) : field.type === "phone" ? (
        <PhoneInput
          name={name}
          defaultValue={stringValue}
          required={field.required}
          className={inputClass}
        />
      ) : (
        <input
          name={name}
          type={field.type}
          defaultValue={stringValue}
          required={field.required}
          className={inputClass}
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
