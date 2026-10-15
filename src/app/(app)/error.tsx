"use client";

import { PageRecovery } from "@/components/ui/page-recovery";

export default function Error({ retry }: { retry: () => void }) {
  return <PageRecovery title="This screen could not be loaded" description="Check your connection and try again. You can also return to the dashboard and open the screen again." retry={retry} returnHref="/dashboard" returnLabel="Return to dashboard" />;
}
