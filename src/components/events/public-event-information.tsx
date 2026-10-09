import { ChevronDown, ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import type { PublicEvent } from "@/lib/events/public-event-data";
import { eventInformationSchema, eventMapLinks } from "@/lib/events/event-information";

export function PublicEventInformation({ event, timezone }: { event: PublicEvent; timezone: string }) {
  const info = event.information;
  const maps = eventMapLinks(event.address);
  const date = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: timezone }).format(new Date(value));
  const flyer = info && eventInformationSchema.shape.flyer_url.safeParse(info.flyer_url).success ? info.flyer_url : "";
  return <details className="group/info mt-3"><summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 py-2 text-sm font-semibold text-[var(--brand-accent-strong)] focus-visible:outline focus-visible:outline-2 [&::-webkit-details-marker]:hidden">Event information<ChevronDown size={16} className="transition-transform group-open/info:rotate-180 motion-reduce:transition-none"/></summary>
    <div className="grid gap-5 border-t border-[#d7ddda] py-4 sm:grid-cols-2">
      <section className="space-y-2 text-sm"><h4 className="font-bold">Venue & directions</h4><p>{event.venue}</p>{event.address && <p className="text-[#66716b]">{event.address}</p>}
        {maps && <div className="flex flex-wrap gap-2">{[[maps.google,"Google Maps"],[maps.apple,"Apple Maps"]].map(([url,label]) => <a key={label} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-md border px-3 font-semibold"><MapPin size={15}/>{label}<ExternalLink size={13}/></a>)}</div>}
        {info?.directions && <p className="whitespace-pre-wrap break-words">{info.directions}</p>}{info?.venue_information && <p className="whitespace-pre-wrap break-words">{info.venue_information}</p>}
      </section>
      <section className="space-y-2 text-sm"><h4 className="font-bold">Entries</h4>{event.entriesOpenAt && <p>Opens {date(event.entriesOpenAt)}</p>}{event.entriesCloseAt && <p>Deadline {date(event.entriesCloseAt)}</p>}{!event.entriesOpenAt && !event.entriesCloseAt && <p className="text-[#66716b]">Contact the producer for entry deadlines.</p>}{info?.entry_information && <p className="whitespace-pre-wrap break-words">{info.entry_information}</p>}
      {info && (info.contact_name || info.contact_phone || info.contact_email) && <div className="space-y-2 border-t pt-3"><h4 className="font-bold">Event contact</h4>{info.contact_name && <p>{info.contact_name}</p>}{info.contact_phone && <a className="flex min-h-10 items-center gap-2" href={`tel:${info.contact_phone.replace(/\D/g, "")}`}><Phone size={15}/>{info.contact_phone}</a>}{info.contact_email && <a className="flex min-h-10 items-center gap-2 break-all" href={`mailto:${info.contact_email}`}><Mail size={15} className="shrink-0"/>{info.contact_email}</a>}</div>}
      {flyer && <a href={flyer} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-md border px-3 font-semibold">View event flyer<ExternalLink size={15}/></a>}
      </section>
    </div>
  </details>;
}
