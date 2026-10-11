import Link from "next/link";
import { ShieldCheck, ArrowLeft, LogOut } from "lucide-react";
import { platformAdminClient } from "@/lib/platform-admin-data";
import { signOut } from "@/app/auth/actions";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  await platformAdminClient();
  return <div className="min-h-screen bg-[#f5f6f7] text-[#18211d]">
    <header className="border-b border-[#dfe4e1] bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
      <Link href="/platform" className="flex items-center gap-2 text-lg font-bold"><ShieldCheck size={22} className="text-[#3146a8]" />Platform Admin</Link>
      <div className="flex items-center gap-4 text-sm font-semibold"><Link href="/dashboard" className="flex items-center gap-2"><ArrowLeft size={16} />Producer workspace</Link><form action={signOut}><button className="flex items-center gap-2"><LogOut size={16} />Sign out</button></form></div>
    </div></header>
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
  </div>;
}
