"use client";

import { Printer } from "lucide-react";

export function PrintReceiptButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print flex h-10 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white"
    >
      <Printer size={16} /> Print receipt
    </button>
  );
}
