import type { Metadata } from "next";
import { LandingPage } from "@/components/marketing/landing-page";

export const metadata: Metadata = {
  title: { absolute: "Roping Systems | Member and Event Management" },
  description:
    "Bring members, events, results, and finances together. Manage entries, schedules, dues, payouts, and season standings, while ropers follow their records and qualification progress online.",
};

export default function Home() {
  return <LandingPage />;
}
