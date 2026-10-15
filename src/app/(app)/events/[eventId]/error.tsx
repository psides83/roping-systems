"use client";

import { PageRecovery } from "@/components/ui/page-recovery";

export default function Error({ retry }: { retry: () => void }) {
  return <PageRecovery title="Event records could not be loaded" description="Check your connection and try again. Return to your events if you need to reopen this event or choose another one." retry={retry} returnHref="/events" returnLabel="Return to events" />;
}
