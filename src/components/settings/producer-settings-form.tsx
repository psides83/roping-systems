"use client";

import { PersistentForm } from "@/components/ui/persistent-form";
import { useActionState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import {
  updateProducerSettings,
  type ProducerSettingsState,
} from "@/app/(app)/settings/actions";
import { PhoneInput } from "@/components/ui/phone-input";
import { useEntryLabelStyle } from "@/components/events/entry-label";

const inputClass =
  "mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3 outline-none focus:border-[var(--brand-accent)] disabled:bg-[#f3f4f3]";

export function ProducerSettingsForm({
  producer,
  canEdit,
}: {
  producer: {
    name: string;
    publicName: string;
    email: string;
    phone: string;
    timezone: string;
    allowGuestEntries: boolean;
  };
  canEdit: boolean;
}) {
  const entryLabelStyle = useEntryLabelStyle();
  const [state, action, pending] = useActionState<
    ProducerSettingsState,
    FormData
  >(updateProducerSettings, {});
  return (
    <PersistentForm action={action} className="space-y-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="block w-80 max-w-full text-sm font-semibold">
          Producer name
          <input
            name="name"
            autoCapitalize="none"
            defaultValue={producer.name}
            disabled={!canEdit}
            className={inputClass}
            required
          />
        </label>
        <label className="block w-80 max-w-full text-sm font-semibold">
          Public display name
          <input
            name="publicName"
            autoCapitalize="none"
            defaultValue={producer.publicName}
            disabled={!canEdit}
            className={inputClass}
            placeholder="Defaults to producer name"
          />
        </label>
        <label className="block w-80 max-w-full text-sm font-semibold">
          Public contact email
          <input
            name="email"
            type="email"
            defaultValue={producer.email}
            disabled={!canEdit}
            className={inputClass}
          />
        </label>
        <label className="block w-56 max-w-full text-sm font-semibold">
          Public contact phone
          <PhoneInput
            defaultValue={producer.phone}
            disabled={!canEdit}
            className={inputClass}
          />
        </label>
        <label className="block w-40 max-w-full text-sm font-semibold">
          Event timezone
          <select
            name="timezone"
            defaultValue={producer.timezone}
            disabled={!canEdit}
            className={inputClass}
          >
            <option value="America/Chicago">Central</option>
            <option value="America/Denver">Mountain</option>
            <option value="America/Phoenix">Arizona</option>
            <option value="America/Los_Angeles">Pacific</option>
            <option value="America/New_York">Eastern</option>
          </select>
        </label>
      <label className="block w-56 max-w-full text-sm font-semibold">
        Multiple-entry labels
        <select name="entryLabelStyle" defaultValue={entryLabelStyle} disabled={!canEdit}
          className="mt-2 block h-10 w-56 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm">
          <option value="number">Numbers (1, 2, 3)</option>
          <option value="letter">Letters (A, B, C)</option>
        </select>
      </label>
      </div>
      <label className="flex items-center gap-3 text-sm font-semibold">
        <input
          name="allowGuestEntries"
          type="checkbox"
          defaultChecked={producer.allowGuestEntries}
          disabled={!canEdit}
          className="h-4 w-4 accent-[var(--brand-accent)]"
        />{" "}
        Allow non-member entries
      </label>
      {state.message ? (
        <p
          className={`rounded-md border p-3 text-sm ${state.success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}
        >
          {state.message}
        </p>
      ) : null}
      {canEdit ? (
        <div className="flex justify-end border-t border-[#e7ebe8] pt-4">
          <button
            disabled={pending}
            className="flex h-10 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}{" "}
            Save settings
          </button>
        </div>
      ) : (
        <p className="text-xs text-[#758078]">
          Only owners and administrators can change producer settings.
        </p>
      )}
    </PersistentForm>
  );
}
