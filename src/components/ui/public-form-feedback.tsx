"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function PublicFormFeedback({ message, errors = [], submission }: {
  message?: string;
  submission?: object;
  errors?: { name: string; label: string; message: string }[];
}) {
  const panel = useRef<HTMLDivElement>(null);
  const errorKey = errors.map(error => `${error.name}:${error.message}`).join("|");
  useEffect(() => {
    if (message || errorKey) panel.current?.focus();
  }, [message, errorKey, submission]);
  if (!message && !errors.length) return null;
  return <div ref={panel} tabIndex={-1} role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 outline-none focus-visible:ring-2 focus-visible:ring-rose-700">
    <p className="font-semibold">{message ?? "Review the highlighted fields and try again."}</p>
    {!!errors.length && <ul className="mt-2 space-y-2">{errors.map(error => <li key={error.name}><button type="button" className="min-h-11 text-left underline underline-offset-2" onClick={event => {
      const field = event.currentTarget.form?.elements.namedItem(error.name);
      if (field instanceof HTMLElement) field.focus();
      else if (field instanceof RadioNodeList) (field[0] as HTMLElement | undefined)?.focus();
    }}>{error.label}: {error.message}</button></li>)}</ul>}
    <p className="mt-2">Your answers are still on this page.</p>
  </div>;
}

export function PublicFormConfirmation({ children, className }: { children: ReactNode; className: string }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { panel.current?.focus(); }, []);
  return <div ref={panel} tabIndex={-1} className={`${className} outline-none`} role="status">{children}</div>;
}
