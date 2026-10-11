import { accountStatuses, type AccountStatus } from "@/lib/platform-admin";
const colors: Record<AccountStatus, string> = {
  pending: "bg-amber-50 text-amber-800", setup: "bg-sky-50 text-sky-800", active: "bg-emerald-50 text-emerald-800",
  suspended: "bg-rose-50 text-rose-800", archived: "bg-[#eef1ef] text-[#66716b]",
};
export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  return <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${colors[status]}`}>{accountStatuses[status]}</span>;
}
