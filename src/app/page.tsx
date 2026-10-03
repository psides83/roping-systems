import type { Metadata } from "next";
import { LandingPage } from "@/components/marketing/landing-page";

export const metadata: Metadata = {
  title: "Roping Systems | Calf roping event management",
  description:
    "Manage memberships, entries, draws, timing, payouts, and live results from one event-day system built for calf roping producers.",
};

export default function Home() {
  return <LandingPage />;
}
