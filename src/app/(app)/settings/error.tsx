"use client";

import { PageRecovery } from "@/components/ui/page-recovery";

export default function Error({ retry }: { retry: () => void }) {
  return <PageRecovery title="Producer settings could not be loaded" description="Check your connection and try again. If this keeps happening, reopen settings from the dashboard." retry={retry} returnHref="/dashboard" returnLabel="Return to dashboard" />;
}
