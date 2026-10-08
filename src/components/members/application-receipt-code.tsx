"use client";
import { useActionState } from "react";
import { KeyRound, LoaderCircle } from "lucide-react";
import { issueApplicationReceipt } from "@/app/(app)/settings/membership-form/actions";
import { PrivateReceiptCode } from "./private-receipt-code";

export function ApplicationReceiptCode({ applicationId }: { applicationId: string }) {
  const [state, action, pending] = useActionState(issueApplicationReceipt, {});
  return <details className="mt-4 border-t border-[#edf0ee] pt-4"><summary className="cursor-pointer text-xs font-semibold">Account connection · no sign-in linked</summary>
    <form action={action} className="mt-3 space-y-3" aria-busy={pending}>
      <input type="hidden" name="applicationId" value={applicationId} />
      <button disabled={pending} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#ccd4d0] px-3 text-xs font-semibold">{pending ? <LoaderCircle size={14} className="animate-spin" /> : <KeyRound size={14} />}{state.receiptCode ? "Replace receipt code" : "Generate receipt code"}</button>
      <p className="text-xs text-[#66716b]">Provide the code privately to the applicant. They must confirm the email on their application. Generating a new code invalidates the previous one.</p>
      {state.receiptCode && <PrivateReceiptCode code={state.receiptCode} />}
      {state.error && <p role="alert" className="text-xs text-rose-700">{state.error}</p>}
    </form>
  </details>;
}
