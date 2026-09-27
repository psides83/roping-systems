import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Roping Systems", template: "%s | Roping Systems" },
  description: "Calf roping membership, entries, and live event management.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
