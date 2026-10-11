import { PersistentForm } from "@/components/ui/persistent-form";
import { updateClassRoundOrdering } from "@/app/(app)/events/[eventId]/actions";
import type { RoundOrderMethod } from "@/types/domain";

const roundOrderLabels: Record<RoundOrderMethod, string> = {
  reverse_first: "Reverse first-round order",
  aggregate_slowest_to_fastest: "Slowest aggregate to fastest",
  custom: "Custom / manual order",
};

export function ClassRoundOrderingForm({
  eventId,
  divisionId,
  roundCount,
  secondRoundOrdering,
  laterRoundOrdering,
  editable,
  embedded = false,
}: {
  eventId: string;
  divisionId: string;
  roundCount: number;
  secondRoundOrdering: RoundOrderMethod;
  laterRoundOrdering: RoundOrderMethod;
  editable: boolean;
  embedded?: boolean;
}) {
  if (roundCount < 2) return null;

  return (
    <PersistentForm
      action={updateClassRoundOrdering.bind(null, eventId)}
      className={`${embedded ? "" : "mt-4 border-t border-[#e7ebe8] pt-4"} grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end`}
    >
      <input type="hidden" name="divisionId" value={divisionId} />
      <OrderSelect
        name="secondRoundOrdering"
        label="Round 2 order"
        value={secondRoundOrdering}
        disabled={!editable}
      />
      {roundCount > 2 ? (
        <OrderSelect
          name="laterRoundOrdering"
          label="Round 3 and later"
          value={laterRoundOrdering}
          disabled={!editable}
        />
      ) : (
        <input
          type="hidden"
          name="laterRoundOrdering"
          value={laterRoundOrdering}
        />
      )}
      <button
        disabled={!editable}
        className="h-10 rounded-md border border-[#d7ddda] px-4 text-xs font-semibold disabled:opacity-50"
      >
        Save order rules
      </button>
      <p className="text-xs leading-5 text-[#758078] sm:col-span-full">
        Custom order creates a starting list on the live desk, then lets you
        move contestants and save the final order.
      </p>
    </PersistentForm>
  );
}

function OrderSelect({
  name,
  label,
  value,
  disabled,
}: {
  name: string;
  label: string;
  value: RoundOrderMethod;
  disabled: boolean;
}) {
  return (
    <label className="text-xs font-semibold text-[#66716b]">
      {label}
      <select
        name={name}
        defaultValue={value}
        disabled={disabled}
        className="mt-1 block h-10 w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-normal text-[#17201c] disabled:bg-[#f1f3f2]"
      >
        {Object.entries(roundOrderLabels).map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
