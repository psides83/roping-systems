"use client";

import { PageRecovery } from "@/components/ui/page-recovery";

export default function Error({ retry }: { retry: () => void }) {
  return <PageRecovery title="Arena records could not be refreshed" description="Check your connection and try again. Review the active event and saved timing status before continuing competition." retry={retry} returnHref="/events" returnLabel="Return to events" />;
}
