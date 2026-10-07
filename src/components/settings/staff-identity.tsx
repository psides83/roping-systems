export function StaffIdentity({ name, email }: { name: string | null; email: string | null }) {
  return <div className="min-w-0">
    <p className="break-words text-sm font-semibold">{name?.trim() || "Name not provided"}</p>
    <p className="mt-1 break-all text-xs text-[#66716b]">{email || "No email"}</p>
  </div>;
}
