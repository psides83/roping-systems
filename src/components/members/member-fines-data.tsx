import { createClient } from "@/lib/supabase/server";
import { MemberFines } from "./member-fines";
import type { FineRestriction, MemberFine } from "@/lib/member-fines";

export async function MemberFinesData({ membershipId, canManage }: { membershipId: string; canManage: boolean }) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("member_fines")
    .select("id, amount_cents, reason, restriction, issued_at, issued_by_label, member_fine_transactions(id, kind, amount_cents, reason, reverses_id, created_at, staff_label), member_fine_exceptions(id, event_roping_id, expires_at, reason, created_at, staff_label, revoked_at, revocation_reason)")
    .eq("membership_id", membershipId).order("issued_at", { ascending: false });
  if (error) throw new Error(`Unable to load member fines: ${error.message}`);
  const fines: MemberFine[] = (data ?? []).map((fine) => ({
    id: fine.id, amountCents: fine.amount_cents, reason: fine.reason,
    restriction: fine.restriction as FineRestriction, issuedAt: fine.issued_at, staff: fine.issued_by_label,
    transactions: fine.member_fine_transactions.map((transaction) => ({
      id: transaction.id, kind: transaction.kind as "payment" | "waiver" | "reversal",
      amountCents: transaction.amount_cents, reason: transaction.reason, reversesId: transaction.reverses_id,
      createdAt: transaction.created_at, staff: transaction.staff_label,
    })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    exceptions: fine.member_fine_exceptions.map((exception) => ({
      id: exception.id, ropingId: exception.event_roping_id, expiresAt: exception.expires_at,
      reason: exception.reason, createdAt: exception.created_at, staff: exception.staff_label,
      revokedAt: exception.revoked_at, revocationReason: exception.revocation_reason,
    })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  }));
  let ropings: { id: string; name: string }[] = [];
  if (canManage) {
    const { data: membership } = await supabase.from("memberships").select("roper_id, producer_id").eq("id", membershipId).single();
    if (membership) {
      const { data: entries, error: entryError } = await supabase.from("roping_entries")
        .select("event_roping_id, event_ropings!inner(name, scheduled_date)")
        .eq("roper_id", membership.roper_id).eq("producer_id", membership.producer_id);
      if (entryError) throw new Error(`Unable to load entered ropings: ${entryError.message}`);
      ropings = [...new Map((entries ?? []).map((entry) => {
        const roping = entry.event_ropings as unknown as { name: string; scheduled_date: string };
        return [entry.event_roping_id, { id: entry.event_roping_id, name: `${roping.name} · ${roping.scheduled_date}` }];
      })).values()];
    }
  }
  return <MemberFines membershipId={membershipId} fines={fines} ropings={ropings} canManage={canManage} />;
}
