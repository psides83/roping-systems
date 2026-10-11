import { platformAdminClient } from "@/lib/platform-admin-data";
import { PlatformAuthenticator } from "@/components/platform/authenticator";

export default async function PlatformSecurityPage() {
  const db = await platformAdminClient();
  const { data, error } = await db.from("platform_security_history").select("id,verified_at").order("verified_at", { ascending: false }).limit(20);
  if (error) throw new Error("Unable to load security history.");
  return <div className="max-w-2xl space-y-7"><header><h1 className="text-2xl font-bold">Account security</h1><p className="mt-2 text-sm leading-6 text-[#66716b]">Two-factor verification is required for Platform Admin. Keep a backup authenticator available in case your primary device is lost.</p></header><PlatformAuthenticator manage /><section><h2 className="text-lg font-bold">Verified admin sessions</h2><p className="mt-1 text-sm text-[#66716b]">First recorded Platform Admin access per verified session. This is not a list of currently active sessions.</p><ol className="mt-3 divide-y divide-[#dfe4e1]">{data.map((entry) => <li key={entry.id} className="py-3 text-sm">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(new Date(entry.verified_at))}</li>)}</ol>{!data.length && <p className="mt-3 text-sm text-[#66716b]">No recorded sessions yet.</p>}</section></div>;
}
