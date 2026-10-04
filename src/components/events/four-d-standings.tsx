export interface FourDResultRow {
  dNumber: number;
  dLabel: string;
  dStartSeconds: number;
  dEndSeconds: number | null;
  placeNumber: number;
  entryId: string;
  contestantName: string;
  entryNumber: number;
  finalTimeSeconds: number;
  activeDivisions: number;
  placesPaid: number;
  purseBasisPoints: number;
}

export interface FourDResultDatabaseRow {
  d_number: number;
  d_label: string;
  d_start_seconds: number | string;
  d_end_seconds: number | string | null;
  place_number: number;
  entry_id: string;
  contestant_name: string;
  entry_number: number;
  final_time_seconds: number | string;
  active_divisions: number;
  places_paid: number;
  purse_basis_points: number;
}

export function mapFourDResult(row: FourDResultDatabaseRow): FourDResultRow {
  return {
    dNumber: row.d_number,
    dLabel: row.d_label,
    dStartSeconds: Number(row.d_start_seconds),
    dEndSeconds: row.d_end_seconds === null ? null : Number(row.d_end_seconds),
    placeNumber: row.place_number,
    entryId: row.entry_id,
    contestantName: row.contestant_name,
    entryNumber: row.entry_number,
    finalTimeSeconds: Number(row.final_time_seconds),
    activeDivisions: row.active_divisions,
    placesPaid: row.places_paid,
    purseBasisPoints: row.purse_basis_points,
  };
}

export function FourDStandings({
  rows,
  resultStatus,
  title = "Live 4D standings",
}: {
  rows: FourDResultRow[];
  resultStatus: string;
  title?: string;
}) {
  const activeDivisions = rows[0]?.activeDivisions ?? 0;

  return (
    <section className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e7ebe8] p-4">
        <div>
          <h2 className="text-sm font-bold">{title}</h2>
          <p className="mt-1 text-xs text-[#758078]">
            D windows recalculate from the current fastest completed final time.
          </p>
        </div>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold capitalize text-amber-800">
          {resultStatus}
        </span>
      </header>
      {rows.length ? (
        <div className="grid gap-px bg-[#e7ebe8] lg:grid-cols-2">
          {Array.from({ length: activeDivisions }, (_, index) => index + 1).map(
            (dNumber) => {
              const divisionRows = rows.filter(
                (row) => row.dNumber === dNumber,
              );
              const settings = rows.find((row) => row.dNumber === dNumber);
              const fallback = rows[0];
              const split =
                fallback.dEndSeconds === null
                  ? 0
                  : fallback.dEndSeconds - fallback.dStartSeconds;
              const start =
                settings?.dStartSeconds ??
                fallback.dStartSeconds + (dNumber - 1) * split;
              return (
                <div key={dNumber} className="bg-white p-4">
                  <div className="mb-3 flex items-baseline justify-between gap-3">
                    <h3 className="font-bold">{dNumber}D</h3>
                    <span className="text-xs text-[#758078]">
                      {settings
                        ? `${settings.dStartSeconds.toFixed(2)}${settings.dEndSeconds === null ? "+" : ` to < ${settings.dEndSeconds.toFixed(2)}`}`
                        : `Starts at ${start.toFixed(2)}`}
                    </span>
                  </div>
                  {divisionRows.length ? (
                    <div className="space-y-1">
                      {divisionRows.map((row) => (
                        <div
                          key={row.entryId}
                          className={`grid grid-cols-[34px_1fr_auto] items-center gap-2 rounded px-2 py-2 text-sm ${row.placeNumber <= row.placesPaid ? "bg-emerald-50" : ""}`}
                        >
                          <span className="font-mono text-xs text-[#758078]">
                            {row.placeNumber}
                          </span>
                          <span className="min-w-0 truncate font-semibold">
                            {row.contestantName}
                          </span>
                          <span className="font-mono font-bold">
                            {row.finalTimeSeconds.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-3 text-sm text-[#8a938e]">
                      No completed times in this D.
                    </p>
                  )}
                  {settings ? (
                    <p className="mt-2 text-[11px] text-[#758078]">
                      {(settings.purseBasisPoints / 100).toFixed(2)}% of purse ·
                      pays {settings.placesPaid}
                    </p>
                  ) : null}
                </div>
              );
            },
          )}
        </div>
      ) : (
        <p className="p-6 text-center text-sm text-[#758078]">
          Standings will appear after the first completed time.
        </p>
      )}
    </section>
  );
}
