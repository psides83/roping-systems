"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Trash2, X } from "lucide-react";

interface DeleteResult {
  success?: boolean;
  message?: string;
}

interface DeleteRecordButtonProps {
  recordType: string;
  recordName: string;
  warning: string;
  disabled?: boolean;
  onDelete: () => Promise<DeleteResult>;
  onDeleted?: () => void;
}

export function DeleteRecordButton({
  recordType,
  recordName,
  warning,
  disabled,
  onDelete,
  onDeleted,
}: DeleteRecordButtonProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function confirmDelete() {
    setMessage("");
    startTransition(async () => {
      const result = await onDelete();
      if (!result.success) {
        setMessage(result.message ?? `Unable to delete this ${recordType}.`);
        return;
      }
      setOpen(false);
      onDeleted?.();
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="flex h-10 items-center gap-2 rounded-md border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
      >
        <Trash2 size={16} /> Delete
      </button>
      {open ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/55 p-4">
          <button
            type="button"
            aria-label="Close confirmation"
            className="absolute inset-0"
            onClick={() => setOpen(false)}
          />
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-record-title"
            className="relative w-full max-w-md rounded-md bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="delete-record-title" className="text-lg font-bold">
                  Delete {recordName}?
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#66716b]">
                  {warning}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md hover:bg-[#f0f2f1]"
              >
                <X size={18} />
              </button>
            </div>
            {message ? (
              <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                {message}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2 border-t border-[#e7ebe8] pt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-10 rounded-md border border-[#ccd4d0] px-4 text-sm font-semibold"
              >
                Keep {recordType}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={confirmDelete}
                className="flex h-10 items-center gap-2 rounded-md bg-rose-700 px-4 text-sm font-bold text-white hover:bg-rose-800 disabled:opacity-50"
              >
                {pending ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  <Trash2 size={16} />
                )}{" "}
                Delete {recordType}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
