"use client";
import type { PenaltyOption } from "@/lib/penalties";
export function PenaltyChoices({ options, selected, onChange, disabled = false }: {
  options: PenaltyOption[]; selected: string[]; onChange: (ids: string[]) => void; disabled?: boolean;
}) {
  return <fieldset className="mt-4"><legend className="text-xs font-bold uppercase text-[#66716b]">Penalties</legend>
    {options.length ? <div className="mt-2 flex flex-wrap gap-2">{options.map((option) => <label key={option.id}
      className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${selected.includes(option.id) ? "border-[var(--brand-accent)] bg-[var(--brand-accent-tint)]" : "border-[#d7ddda]"}`}>
      <input type="checkbox" name="penaltyId" value={option.id} checked={selected.includes(option.id)} disabled={disabled}
        onChange={(event) => onChange(event.target.checked ? [...selected, option.id] : selected.filter((id) => id !== option.id))} />
      <span>{option.name}{option.retained ? <span className="ml-1 text-xs text-[#66716b]">(recorded)</span> : null}</span>
      <span className="font-mono text-xs font-semibold">+{Number(option.seconds).toFixed(2)}s</span>
    </label>)}</div> : <p className="mt-2 text-sm text-[#758078]">No applicable penalties</p>}
  </fieldset>;
}
