import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Roping Systems", template: "%s | Roping Systems" },
  description: "Member management, event planning, and live results for roping organizations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
