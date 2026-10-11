import Link from "next/link";
import { CreatePlatformProducerForm } from "@/components/platform/account-forms";

export default function NewProducerPage() {
  return <div className="max-w-3xl space-y-6"><nav className="text-sm text-[#66716b]"><Link href="/platform" className="underline">Producer accounts</Link> / Create producer</nav><header><h1 className="text-2xl font-bold">Create producer</h1><p className="mt-2 text-sm text-[#66716b]">Establish the account and invite its primary administrator.</p></header><CreatePlatformProducerForm /></div>;
}
