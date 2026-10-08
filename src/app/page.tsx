import type { Metadata } from "next";
import { LandingPage } from "@/components/marketing/landing-page";

export const metadata: Metadata = {
  title: { absolute: "Roping Systems | Member and Event Management" },
  description:
    "Bring members, events, and results together. Roping Systems helps organizations manage memberships, registrations, schedules, payments, and live results in one place.",
};

export default function Home() {
  return <LandingPage />;
}
