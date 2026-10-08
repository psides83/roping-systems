import { useId } from "react";
import { CircleHelp } from "lucide-react";

export function CutoffDateLabel({ kind = "standings" }: { kind?: "standings" | "attendance" }) {
  const tooltipId = useId();
  const cutoffHelp = kind === "attendance"
    ? "The cutoff date is inclusive: qualifying ropings dated on this day count toward the attendance requirement. Ropings from the following day do not count. Leave blank to use the end of the season."
    : "The cutoff date is inclusive: official winnings dated on this day count toward qualifying standings. Winnings from the following day do not count. Leave blank to use the end of the season.";
  return <span className="group relative inline-flex items-center gap-1.5">
    {kind === "attendance" ? "Attendance cutoff" : "Standings cutoff"}
    <span tabIndex={0} aria-label={`About the ${kind} cutoff date`} aria-describedby={tooltipId} className="inline-flex rounded-sm text-[#758078] outline-offset-2">
      <CircleHelp size={15} aria-hidden="true" />
    </span>
    <span id={tooltipId} role="tooltip" className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-64 max-w-[calc(100vw-4rem)] rounded-md bg-[#17201b] px-3 py-2 text-left text-xs font-normal leading-5 text-white shadow-lg group-hover:block group-focus-within:block">
      {cutoffHelp}
    </span>
  </span>;
}
