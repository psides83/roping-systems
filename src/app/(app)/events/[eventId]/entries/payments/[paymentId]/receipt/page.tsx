import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PrintReceiptButton } from "@/components/events/print-receipt-button";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";

export default async function PaymentReceiptPage({
  params,
}: {
  params: Promise<{ eventId: string; paymentId: string }>;
}) {
  const { eventId, paymentId } = await params;
  const producer = await getActiveProducer();
  if (!producer) notFound();
  const supabase = await createClient();
  const { data: payment } = await supabase
    .from("event_payments")
    .select(
      "id, event_id, roper_id, amount_cents, payment_method, note, received_by_label, received_at, voided_at, void_reason, voided_by_label",
    )
    .eq("id", paymentId)
    .eq("event_id", eventId)
    .eq("producer_id", producer.id)
    .single();
  if (!payment) notFound();

  const [{ data: roping }, { data: person }] = await Promise.all([
    supabase.from("events").select("title").eq("id", eventId).single(),
    supabase
      .from("ropers")
      .select("first_name, last_name")
      .eq("id", payment.roper_id)
      .single(),
  ]);
  if (!roping || !person) notFound();

  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: producer.timezone,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="no-print flex items-center justify-between gap-3">
        <Link
          href={`/events/${eventId}/entries`}
          className="flex h-10 items-center gap-2 text-sm font-semibold text-[#46524b]"
        >
          <ArrowLeft size={16} /> Back to entries
        </Link>
        <PrintReceiptButton />
      </div>
      <article className="print-receipt rounded-md border border-[#dfe4e1] bg-white p-8 shadow-sm">
        <header className="border-b border-[#dfe4e1] pb-5">
          <p className="text-xs font-bold uppercase text-[#66716b]">
            {producer.name}
          </p>
          <h1 className="mt-2 text-2xl font-bold">Cash payment receipt</h1>
          <p className="mt-1 text-sm text-[#66716b]">{roping.title}</p>
        </header>
        {payment.voided_at ? (
          <div className="mt-5 border-2 border-rose-600 p-3 text-center text-sm font-bold uppercase text-rose-700">
            Voided payment
          </div>
        ) : null}
        <dl className="mt-6 grid grid-cols-[1fr_auto] gap-x-6 gap-y-4 text-sm">
          <dt className="text-[#66716b]">Contestant</dt>
          <dd className="text-right font-semibold">
            {person.first_name} {person.last_name}
          </dd>
          <dt className="text-[#66716b]">Amount received</dt>
          <dd className="text-right text-xl font-bold">
            {formatCurrency(payment.amount_cents)}
          </dd>
          <dt className="text-[#66716b]">Payment method</dt>
          <dd className="text-right font-semibold">Cash</dd>
          <dt className="text-[#66716b]">Received</dt>
          <dd className="text-right font-semibold">
            {dateFormatter.format(new Date(payment.received_at))}
          </dd>
          <dt className="text-[#66716b]">Accepted by</dt>
          <dd className="text-right font-semibold">
            {payment.received_by_label}
          </dd>
          <dt className="text-[#66716b]">Receipt number</dt>
          <dd className="text-right font-mono text-xs">
            {payment.id.slice(0, 8).toUpperCase()}
          </dd>
          {payment.note ? (
            <>
              <dt className="text-[#66716b]">Note</dt>
              <dd className="max-w-sm text-right">{payment.note}</dd>
            </>
          ) : null}
        </dl>
        {payment.voided_at ? (
          <div className="mt-6 border-t border-[#dfe4e1] pt-4 text-sm">
            <p>
              <strong>Voided:</strong>{" "}
              {dateFormatter.format(new Date(payment.voided_at))}
            </p>
            <p className="mt-1">
              <strong>Voided by:</strong> {payment.voided_by_label}
            </p>
            <p className="mt-1">
              <strong>Reason:</strong> {payment.void_reason}
            </p>
          </div>
        ) : null}
        <footer className="mt-8 border-t border-[#dfe4e1] pt-4 text-xs text-[#66716b]">
          This receipt records cash received for the event listed above.
        </footer>
      </article>
    </div>
  );
}
