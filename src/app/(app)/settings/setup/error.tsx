"use client";

import { PageRecovery } from "@/components/ui/page-recovery";

export default function Error({ retry }: { retry: () => void }) {
  return <PageRecovery title="Setup checks could not be loaded" description="Check your connection and try again. You can return to your templates while setup checks are unavailable." retry={retry} returnHref="/settings/roping-templates" returnLabel="Open roping templates" />;
}
