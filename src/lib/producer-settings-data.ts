import "server-only";
import { getActiveProducer } from "@/lib/producers";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { ProducerSeason } from "@/lib/seasons";

export async function getProducerSettingsData(includeSeasons: boolean) {
  if (!isSupabaseConfigured()) return {
    producer: { name: "Red River Calf Ropers", publicName: "", email: "office@example.com", phone: "(940) 555-0100", timezone: "America/Chicago", allowGuestEntries: true, logoUrl: null, brandPrimary: "#17251F", brandAccent: "#BB3E24" },
    role: "owner", seasons: [] as ProducerSeason[],
  };
  const active = await getActiveProducer();
  if (!active) throw new Error("No active producer was found.");
  const db = await createClient();
  const { data: producer, error } = await db.from("producers")
    .select("name,public_name,email,phone,timezone,allow_non_member_entries,logo_path,brand_primary,brand_accent").eq("id", active.id).single();
  if (error || !producer) throw new Error("Unable to load producer settings.");
  const seasons = includeSeasons ? await db.from("producer_seasons").select("id,name,starts_on,ends_on")
    .eq("producer_id", active.id).order("starts_on", { ascending: false }) : { data: [], error: null };
  if (seasons.error) throw new Error("Unable to load producer seasons.");
  return {
    role: active.role,
    producer: {
      name: producer.name, publicName: producer.public_name ?? "", email: producer.email ?? "", phone: producer.phone ?? "",
      timezone: producer.timezone, allowGuestEntries: producer.allow_non_member_entries,
      logoUrl: producer.logo_path ? db.storage.from("organization-logos").getPublicUrl(producer.logo_path).data.publicUrl : null,
      brandPrimary: producer.brand_primary, brandAccent: producer.brand_accent,
    },
    seasons: seasons.data.map((season) => ({ id: season.id, name: season.name, startsOn: season.starts_on, endsOn: season.ends_on })),
  };
}
