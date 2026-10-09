"use client";
import { RefreshCw } from "lucide-react";
export default function Error({ retry }: { retry: () => void }) {
  return <div role="alert" className="space-y-3 border-l-4 border-rose-600 bg-rose-50 p-5"><h2 className="font-bold">Setup checks could not be loaded</h2><p className="text-sm">Check your connection and retry. No settings have been changed.</p><button onClick={retry} className="inline-flex min-h-11 items-center gap-2 rounded-md border bg-white px-3 text-sm font-semibold"><RefreshCw size={16} />Retry</button></div>;
}
