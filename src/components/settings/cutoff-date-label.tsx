import { useId } from "react";
import { CircleHelp } from "lucide-react";

const cutoffHelp = "The cutoff date is inclusive: official winnings dated on this day count toward qualifying standings. Winnings from the following day do not count.";

export function CutoffDateLabel() {
  const tooltipId = useId();
  return <span className="group relative inline-flex items-center gap-1.5">
    Cutoff date
    <span tabIndex={0} aria-label="About the cutoff date" aria-describedby={tooltipId} className="inline-flex rounded-sm text-[#758078] outline-offset-2">
      <CircleHelp size={15} aria-hidden="true" />
    </span>
    <span id={tooltipId} role="tooltip" className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-64 max-w-[calc(100vw-4rem)] rounded-md bg-[#17201b] px-3 py-2 text-left text-xs font-normal leading-5 text-white shadow-lg group-hover:block group-focus-within:block">
      {cutoffHelp}
    </span>
  </span>;
}
