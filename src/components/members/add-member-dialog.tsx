"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { LoaderCircle, Plus, X } from "lucide-react";
import { addMember, type MemberFormState } from "@/app/(app)/members/actions";

const initialState: MemberFormState = {};

export function AddMemberDialog({ configured }: { configured: boolean }) {
  const [open, setOpen] = useState(false);
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
        <Plus size={17} /> Add member
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
                  Add organization member
                </h2>
                <p className="mt-1 text-sm text-[#66716b]">
                  Contact details belong to the roper; the member number belongs
                  to this organization.
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
            <form ref={formRef} action={action} className="space-y-4 p-5">
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
                  label="Member number"
                  name="memberNumber"
                  placeholder="RR-1205"
                  error={state.errors?.memberNumber?.[0]}
                />
                <label className="block text-sm font-semibold">
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
                </label>
              </div>
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
                  Add member
                </button>
              </div>
            </form>
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
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] px-3 outline-none focus:border-[var(--brand-accent)]"
      />
      {error ? (
        <span className="mt-1.5 block text-xs font-medium text-rose-700">
          {error}
        </span>
      ) : null}
    </label>
  );
}
