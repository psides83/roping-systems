import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { loadImportChoices } from "./actions";
import { MemberImportWorkspace } from "@/components/members/member-import-workspace";

export default async function MemberImportPage() {
  const producer = await getActiveProducer();
  if (!producer || producer.role === "viewer") return <p className="p-5 text-sm">Member management access is required to import members.</p>;
  const divisions = await loadImportChoices();
  const db = await createClient();
  const { data: batches } = await db.from("member_import_batches").select("id,file_name,created_at,member_import_rows(row_number)").eq("producer_id", producer.id).order("created_at", { ascending: false }).limit(10);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: producer.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <div className="space-y-5">
    <Link href="/members" className="inline-flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={16} />Members</Link>
    <header><h1 className="text-2xl font-bold">Import members</h1><p className="mt-2 text-sm text-[#66716b]">{producer.name}</p></header>
    <MemberImportWorkspace initialDivisions={divisions} today={today} />
    {Boolean(batches?.length) && <details className="border-t pt-4"><summary className="cursor-pointer font-semibold">Recent imports</summary><ul className="mt-3 space-y-2 text-sm">{batches?.map((batch) => <li key={batch.id} className="flex flex-wrap gap-3"><span className="font-semibold">{batch.file_name}</span><span>{batch.member_import_rows.length} imported</span><time dateTime={batch.created_at}>{new Intl.DateTimeFormat("en-US", { timeZone: producer.timezone, dateStyle: "medium" }).format(new Date(batch.created_at))}</time></li>)}</ul></details>}
  </div>;
}
