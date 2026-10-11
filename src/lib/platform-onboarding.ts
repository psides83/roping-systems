import { onboardingTasks, type PlatformDetail } from "./platform-admin";

export function onboardingReview(detail: PlatformDetail) {
  const signals = {
    owner: "Confirm the producer's primary administrator can sign in and access their workspace.",
    divisions: `${detail.setup.divisions} divisions and ${detail.setup.classifications} classifications configured.`,
    templates: `${detail.setup.templates} reusable roping templates configured.`,
    payouts: `${detail.setup.payouts} payout schedules configured. Review completeness and allocations.`,
    season: `${detail.setup.seasons} seasons configured. Confirm the start and end dates.`,
    records: `${detail.setup.members} roper records available. A new producer may start without existing records.`,
    launch: "Check the public schedule, results, rules, and contact information before launch.",
  };
  const guidance = {
    owner: "Confirm the administrator's invitation is accepted and their intended permissions work. Platform Owner access alone is not producer onboarding.",
    divisions: "Review the divisions offered, numbered classifications, handicap offsets, and entry restrictions. Only configure formats this producer uses.",
    templates: "Check rounds, fees, optional pots, entry limits, and timing rules against the producer's actual formats.",
    payouts: "Confirm the schedules needed for these templates are complete, including each applicable round, aggregate, and 4-D division.",
    season: "Confirm the producer's season dates, membership requirements, and any standings or finals cutoffs they use.",
    records: "Review member imports and duplicates. If migrating mid-season, also review historical standings, attendance, and opening fund balances. An empty roster is valid for a new producer.",
    launch: "Verify public information, staff access, and a representative event workflow with the producer. Mark this reviewed only after the launch review is complete.",
  };
  const steps = Object.entries(onboardingTasks).map(([key, label]) => {
    const taskKey = key as keyof typeof onboardingTasks;
    const reviewedAt = detail.tasks.find((task) => task.task_key === taskKey)?.completed_at ?? null;
    return { key: taskKey, label, reviewedAt, signal: signals[taskKey], guidance: guidance[taskKey] };
  });
  const reviewed = steps.filter((step) => step.reviewedAt).length;
  return { steps, reviewed, total: steps.length, next: steps.find((step) => !step.reviewedAt) ?? null, reviewComplete: reviewed === steps.length };
}
