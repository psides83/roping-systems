import { redirect } from "next/navigation";
import { isPlatformOwner, isVerifiedPlatformOwner } from "@/lib/platform-access";
import { PlatformAuthenticator } from "@/components/platform/authenticator";
import { signOut } from "@/app/auth/actions";

export default async function PlatformSecurityGate() {
  if (!await isPlatformOwner()) redirect("/auth/login?next=%2Fplatform");
  if (await isVerifiedPlatformOwner()) redirect("/platform");
  return <main className="mx-auto max-w-lg space-y-6 px-5 py-12"><header><h1 className="text-2xl font-bold">Secure Platform Admin</h1><p className="mt-2 text-sm leading-6 text-[#66716b]">Verify with your authenticator before accessing producer accounts. If this is your first visit, set up your authenticator here.</p></header><PlatformAuthenticator /><form action={signOut}><button className="text-sm font-semibold underline">Sign out</button></form></main>;
}
