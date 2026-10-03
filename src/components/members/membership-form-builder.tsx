"use client";

import { useActionState, useState } from "react";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import {
  saveMembershipForm,
  type MembershipFormState,
} from "@/app/(app)/settings/membership-form/actions";
import {
  standardMembershipFields,
  type CustomMembershipSection,
  type MembershipFieldType,
  type SelectedMembershipField,
} from "@/lib/membership-forms";

const inputClass =
  "mt-2 h-10 w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm outline-none focus:border-[var(--brand-accent)]";

export interface MembershipFormDraft {
  title: string;
  introduction: string;
  publicationState: "draft" | "published" | "unpublished";
  standardFields: SelectedMembershipField[];
  customSections: CustomMembershipSection[];
  releaseText: string;
  requireSignature: boolean;
}

export function MembershipFormBuilder({
  initial,
}: {
  initial: MembershipFormDraft;
}) {
  const [standardFields, setStandardFields] = useState(initial.standardFields);
  const [sections, setSections] = useState(initial.customSections);
  const [state, action, pending] = useActionState<
    MembershipFormState,
    FormData
  >(saveMembershipForm, {});

  function toggleStandardField(key: string) {
    if (["first_name", "last_name"].includes(key)) return;
    setStandardFields((current) =>
      current.some((field) => field.key === key)
        ? current.filter((field) => field.key !== key)
        : [...current, { key, required: false }],
    );
  }

  function setRequired(key: string, required: boolean) {
    setStandardFields((current) =>
      current.map((field) =>
        field.key === key ? { ...field, required } : field,
      ),
    );
  }

  function addSection() {
    setSections((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        title: "",
        details: "",
        fields: [newCustomField()],
      },
    ]);
  }

  return (
    <form action={action} className="space-y-6">
      <input
        type="hidden"
        name="standardFields"
        value={JSON.stringify(standardFields)}
      />
      <input
        type="hidden"
        name="customSections"
        value={JSON.stringify(sections)}
      />

      <section className="rounded-md border border-[#dfe4e1] bg-white p-5">
        <h2 className="font-bold">Form details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            Form title
            <input
              name="title"
              defaultValue={initial.title}
              className={inputClass}
              required
            />
          </label>
          <label className="text-sm font-semibold">
            Publication state
            <select
              name="publicationState"
              defaultValue={initial.publicationState}
              className={inputClass}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="unpublished">Unpublished</option>
            </select>
          </label>
          <label className="text-sm font-semibold sm:col-span-2">
            Introduction
            <textarea
              name="introduction"
              defaultValue={initial.introduction}
              rows={4}
              className="mt-2 w-full rounded-md border border-[#ccd4d0] p-3 text-sm outline-none focus:border-[var(--brand-accent)]"
            />
          </label>
        </div>
      </section>

      <section className="rounded-md border border-[#dfe4e1] bg-white p-5">
        <h2 className="font-bold">Standard member information</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {standardMembershipFields.map((field) => {
            const selected = standardFields.find(
              (item) => item.key === field.key,
            );
            const fixed = ["first_name", "last_name"].includes(field.key);
            return (
              <div
                key={field.key}
                className={`flex min-h-12 items-center gap-3 rounded-md border px-3 py-2 ${selected ? "border-[var(--brand-accent)] bg-[#fff8f5]" : "border-[#dfe4e1]"}`}
              >
                <input
                  type="checkbox"
                  checked={Boolean(selected)}
                  disabled={fixed}
                  onChange={() => toggleStandardField(field.key)}
                  className="h-4 w-4 accent-[var(--brand-accent)]"
                />
                <span className="min-w-0 flex-1 text-sm font-semibold">
                  {field.label}
                </span>
                {selected ? (
                  <label className="flex items-center gap-1 text-[11px] font-semibold text-[#66716b]">
                    <input
                      type="checkbox"
                      checked={fixed || selected.required}
                      disabled={fixed}
                      onChange={(event) =>
                        setRequired(field.key, event.target.checked)
                      }
                    />
                    Required
                  </label>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-md border border-[#dfe4e1] bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">Custom sections</h2>
            <p className="mt-1 text-xs text-[#758078]">
              Add producer-specific information and questions.
            </p>
          </div>
          <button
            type="button"
            onClick={addSection}
            className="flex h-9 items-center gap-2 rounded-md border border-[#ccd4d0] px-3 text-xs font-semibold"
          >
            <Plus size={14} /> Add section
          </button>
        </div>
        <div className="mt-4 space-y-4">
          {sections.map((section, sectionIndex) => (
            <CustomSectionEditor
              key={section.id}
              section={section}
              onChange={(next) =>
                setSections((current) =>
                  current.map((item, index) =>
                    index === sectionIndex ? next : item,
                  ),
                )
              }
              onRemove={() =>
                setSections((current) =>
                  current.filter((_, index) => index !== sectionIndex),
                )
              }
            />
          ))}
          {!sections.length ? (
            <p className="rounded-md border border-dashed border-[#cbd2ce] p-6 text-center text-sm text-[#758078]">
              No custom sections added.
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-md border border-[#dfe4e1] bg-white p-5">
        <h2 className="font-bold">Release and signature</h2>
        <label className="mt-4 block text-sm font-semibold">
          Release, assumption of risk, or other agreement
          <textarea
            name="releaseText"
            defaultValue={initial.releaseText}
            rows={10}
            className="mt-2 w-full rounded-md border border-[#ccd4d0] p-3 text-sm leading-6 outline-none focus:border-[var(--brand-accent)]"
          />
        </label>
        <label className="mt-4 flex items-center gap-2 text-sm font-semibold">
          <input
            name="requireSignature"
            type="checkbox"
            defaultChecked={initial.requireSignature}
            className="h-4 w-4 accent-[var(--brand-accent)]"
          />
          Require the signer to type their legal name
        </label>
      </section>

      {state.message ? (
        <p
          className={`rounded-md border p-3 text-sm ${state.success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}
        >
          {state.message}
        </p>
      ) : null}
      <div className="flex justify-end">
        <button
          disabled={pending}
          className="flex h-10 items-center gap-2 rounded-md brand-accent-fill px-4 text-sm font-bold text-white disabled:opacity-50"
        >
          {pending ? <LoaderCircle size={16} className="animate-spin" /> : null}
          Save membership form
        </button>
      </div>
    </form>
  );
}

function newCustomField() {
  return {
    id: crypto.randomUUID(),
    label: "",
    type: "text" as MembershipFieldType,
    required: false,
    options: [],
  };
}

function CustomSectionEditor({
  section,
  onChange,
  onRemove,
}: {
  section: CustomMembershipSection;
  onChange: (section: CustomMembershipSection) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-md border border-[#dfe4e1] p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">
            Section title
            <input
              value={section.title}
              onChange={(event) =>
                onChange({ ...section, title: event.target.value })
              }
              className={inputClass}
              placeholder="Eligibility details"
            />
          </label>
          <label className="text-xs font-semibold">
            Details
            <input
              value={section.details}
              onChange={(event) =>
                onChange({ ...section, details: event.target.value })
              }
              className={inputClass}
              placeholder="Optional instructions"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove custom section"
          className="grid h-9 w-9 place-items-center rounded-md border border-rose-200 text-rose-700"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="mt-4 space-y-2">
        {section.fields.map((field, fieldIndex) => (
          <div
            key={field.id}
            className="grid gap-2 rounded-md bg-[#f7f8f7] p-3 sm:grid-cols-[1fr_150px_auto_auto] sm:items-end"
          >
            <label className="text-xs font-semibold">
              Question
              <input
                value={field.label}
                onChange={(event) =>
                  onChange({
                    ...section,
                    fields: section.fields.map((item, index) =>
                      index === fieldIndex
                        ? { ...item, label: event.target.value }
                        : item,
                    ),
                  })
                }
                className={inputClass}
              />
            </label>
            <label className="text-xs font-semibold">
              Answer type
              <select
                value={field.type}
                onChange={(event) =>
                  onChange({
                    ...section,
                    fields: section.fields.map((item, index) =>
                      index === fieldIndex
                        ? {
                            ...item,
                            type: event.target.value as MembershipFieldType,
                          }
                        : item,
                    ),
                  })
                }
                className={inputClass}
              >
                <option value="text">Short text</option>
                <option value="textarea">Long text</option>
                <option value="date">Date</option>
                <option value="select">Choice list</option>
                <option value="checkbox">Checkbox</option>
              </select>
            </label>
            <label className="flex h-10 items-center gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(event) =>
                  onChange({
                    ...section,
                    fields: section.fields.map((item, index) =>
                      index === fieldIndex
                        ? { ...item, required: event.target.checked }
                        : item,
                    ),
                  })
                }
              />
              Required
            </label>
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...section,
                  fields: section.fields.filter(
                    (_, index) => index !== fieldIndex,
                  ),
                })
              }
              aria-label="Remove question"
              className="grid h-9 w-9 place-items-center rounded-md border border-[#d7ddda] text-rose-700"
            >
              <Trash2 size={14} />
            </button>
            {field.type === "select" ? (
              <label className="text-xs font-semibold sm:col-span-4">
                Choices, separated by commas
                <input
                  value={field.options.join(", ")}
                  onChange={(event) =>
                    onChange({
                      ...section,
                      fields: section.fields.map((item, index) =>
                        index === fieldIndex
                          ? {
                              ...item,
                              options: event.target.value
                                .split(",")
                                .map((option) => option.trim())
                                .filter(Boolean),
                            }
                          : item,
                      ),
                    })
                  }
                  className={inputClass}
                />
              </label>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onChange({
              ...section,
              fields: [...section.fields, newCustomField()],
            })
          }
          className="flex h-9 items-center gap-2 rounded-md border border-dashed border-[#aeb8b2] px-3 text-xs font-semibold"
        >
          <Plus size={14} /> Add question
        </button>
      </div>
    </div>
  );
}
