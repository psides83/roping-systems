"use client";

import { PersistentForm } from "@/components/ui/persistent-form";
import { useActionState, useEffect, useRef, useState } from "react";
import { LoaderCircle, Plus, X } from "lucide-react";
import { addMember, type MemberFormState } from "@/app/(app)/members/actions";
import { PhoneInput } from "@/components/ui/phone-input";
import { useProducerFeatures } from "@/components/settings/producer-features-context";
import { featureEnabled } from "@/lib/producer-features";

const initialState: MemberFormState = {};

interface DisciplineOption {
  id: string;
  name: string;
  classifications: Array<{ id: string; name: string }>;
}

export function AddMemberDialog({
  configured,
  divisions,
}: {
  configured: boolean;
  divisions: DisciplineOption[];
}) {
  const [open, setOpen] = useState(false);
  const requireMemberships = featureEnabled(useProducerFeatures(), "require_memberships");
  const [state, action, pending] = useActionState(addMember, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.success) return;
    formRef.current?.reset();
    const timeoutId = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [state]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-10 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white"
      >
        <Plus size={17} /> Add {requireMemberships ? "member" : "roper"}
      </button>
      {open ? (
        <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-black/45 p-4">
          <button
            aria-label="Close dialog"
            className="absolute inset-0"
            onClick={() => setOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-member-title"
            className="relative my-8 w-full max-w-xl rounded-md bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-[#e1e6e3] p-5">
              <div>
                <h2 id="add-member-title" className="text-lg font-bold">
                  {requireMemberships ? "Add producer member" : "Add roper record"}
                </h2>
                <p className="mt-1 text-sm text-[#66716b]">
                  Contact details belong to the roper; the member number belongs
                  to this producer.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid h-9 w-9 place-items-center rounded-md hover:bg-[#f0f2f1]"
              >
                <X size={18} />
              </button>
            </div>
            <PersistentForm ref={formRef} action={action} className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label="First name"
                  name="firstName"
                  error={state.errors?.firstName?.[0]}
                />
                <FormField
                  label="Last name"
                  name="lastName"
                  error={state.errors?.lastName?.[0]}
                />
                <FormField
                  label="Email"
                  name="email"
                  type="email"
                  error={state.errors?.email?.[0]}
                />
                <FormField
                  label="Phone"
                  name="phone"
                  type="tel"
                  error={state.errors?.phone?.[0]}
                />
                <FormField
                  label="Birth date"
                  name="birthDate"
                  type="date"
                  error={state.errors?.birthDate?.[0]}
                />
                <label className="block text-sm font-semibold">
                  Competition gender
                  <select
                    name="competitionGender"
                    defaultValue=""
                    className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3 outline-none focus:border-[var(--brand-accent)]"
                    required
                  >
                    <option value="" disabled>
                      Select gender
                    </option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                  {state.errors?.competitionGender ? (
                    <span className="mt-1.5 block text-xs font-medium text-rose-700">
                      {state.errors.competitionGender[0]}
                    </span>
                  ) : null}
                </label>
                <FormField
                  label={requireMemberships ? "Member number" : "Roper number"}
                  name="memberNumber"
                  placeholder="RR-1205"
                  error={state.errors?.memberNumber?.[0]}
                />
                {requireMemberships ? <label className="block text-sm font-semibold">
                  Membership status
                  <select
                    name="status"
                    defaultValue="active"
                    className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3 outline-none focus:border-[var(--brand-accent)]"
                  >
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="inactive">Inactive</option>
                    <option value="expired">Expired</option>
                  </select>
                </label> : <input type="hidden" name="status" value="active" />}
              </div>
              {divisions.length ? (
                <fieldset className="rounded-md border border-[#e1e6e3] bg-[#fafbfa] p-4">
                  <legend className="px-1 text-sm font-bold">
                    Starting classifications
                  </legend>
                  <p className="mb-4 text-xs leading-5 text-[#66716b]">
                    Assign a skill classification for each applicable division.
                    These can be changed later from the member profile.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {divisions.map((discipline) => (
                      <label
                        key={discipline.id}
                        className="block text-sm font-semibold"
                      >
                        {discipline.name}
                        <select
                          name="classificationIds"
                          defaultValue=""
                          className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3 outline-none focus:border-[var(--brand-accent)]"
                        >
                          <option value="">Not classified</option>
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
                </fieldset>
              ) : null}
              {state.message ? (
                <p
                  className={`rounded-md border p-3 text-sm ${state.success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}
                >
                  {state.message}
                </p>
              ) : null}
              {!configured ? (
                <p className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                  This form will create live records after Supabase is
                  connected.
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
                  disabled={pending || !configured}
                  className="flex h-10 items-center gap-2 rounded-md brand-accent-fill px-4 text-sm font-bold text-white disabled:opacity-50"
                >
                  {pending ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : null}
                  Add {requireMemberships ? "member" : "roper"}
                </button>
              </div>
            </PersistentForm>
          </section>
        </div>
      ) : null}
    </>
  );
}

function FormField({
  label,
  name,
  type = "text",
  placeholder,
  error,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  error?: string;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      {type === "tel" ? (
        <PhoneInput
          name={name}
          className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] px-3 outline-none focus:border-[var(--brand-accent)]"
        />
      ) : (
        <input
          name={name}
          type={type}
          placeholder={placeholder}
          className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] px-3 outline-none focus:border-[var(--brand-accent)]"
        />
      )}
      {error ? (
        <span className="mt-1.5 block text-xs font-medium text-rose-700">
          {error}
        </span>
      ) : null}
    </label>
  );
}
