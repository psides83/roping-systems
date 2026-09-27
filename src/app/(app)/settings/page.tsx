import { Building2, ChevronRight, LockKeyhole, UserCog } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

const settings = [{ title: "Organization profile", description: "Name, public URL, contact details, and branding", icon: Building2 }, { title: "Team & permissions", description: "Owners, administrators, operators, and viewers", icon: UserCog }, { title: "Security", description: "Authentication and account access policies", icon: LockKeyhole }];

export default function SettingsPage() {
  return <div className="space-y-6"><PageHeader title="Settings" description="Manage organization details, team access, and account preferences." /><section className="divide-y divide-[#e7ebe8] overflow-hidden rounded-md border border-[#dfe4e1] bg-white">{settings.map(({ title, description, icon: Icon }) => <button key={title} className="flex w-full items-center gap-4 p-5 text-left hover:bg-[#fafbfa]"><span className="grid h-10 w-10 place-items-center rounded-md bg-[#eef1ef] text-[#435149]"><Icon size={19} /></span><span className="flex-1"><span className="block text-sm font-bold">{title}</span><span className="mt-1 block text-xs text-[#758078]">{description}</span></span><ChevronRight size={18} className="text-[#98a09b]" /></button>)}</section></div>;
}
