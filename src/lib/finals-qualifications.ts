export type QualifierStage = "go_round" | "aggregate" | "short_round";
export type RepeatQualifierPolicy = "accumulate" | "skip" | "pass_down";
export type QualifierTiePolicy = "all" | "staff_decision";

export interface FinalsQualificationRule {
  id: string;
  producerId: string;
  seasonId: string;
  classId: string;
  ropingId: string;
  stage: QualifierStage;
  round: number | null;
  places: { place: number; positions: number }[];
  repeatPolicy: RepeatQualifierPolicy;
  tiePolicy: QualifierTiePolicy;
  maximumPositions: number | null;
}

export interface QualifierFinish {
  producerId: string;
  seasonId: string;
  classId: string;
  ropingId: string;
  stage: QualifierStage;
  round: number | null;
  date: string;
  official: boolean;
  entryId: string;
  memberId: string | null;
  place: number | null;
}

export interface ManualFinalsPosition {
  id: string;
  producerId: string;
  seasonId: string;
  classId: string;
  memberId: string;
  date: string;
  positions: number;
  reason: string;
  revoked: boolean;
}

export interface FinalsPositionMove {
  id: string;
  producerId: string;
  seasonId: string;
  memberId: string;
  fromClassId: string;
  toClassId: string;
  date: string;
  decision: "transfer" | "revoke";
  reason: string;
}

export interface FinalsPositionAward {
  id: string;
  producerId: string;
  seasonId: string;
  classId: string;
  earnedClassId: string;
  memberId: string;
  positions: number;
  source: "finish" | "manual";
  ruleId?: string;
  entryId?: string;
  ropingId?: string;
  place?: number;
  moves: string[];
  revoked: boolean;
}

export interface FinalsQualificationIssue {
  ruleId: string;
  place: number;
  reason: "tie_requires_decision" | "no_eligible_recipient";
  entryIds: string[];
}

export interface FinalsQualificationDecision {
  ruleId: string;
  place: number;
  kind: "tie" | "revoke";
  entryIds: string[];
  context: (string | number | null)[][];
}

export function finalsDecisionContext(finishes: QualifierFinish[]) {
  return [...finishes].sort((a, b) => a.entryId.localeCompare(b.entryId))
    .map((finish) => [finish.entryId, finish.memberId, finish.place]);
}

const accountKey = (producer: string, season: string, member: string, classification: string) =>
  JSON.stringify([producer, season, member, classification]);
const match = (rule: FinalsQualificationRule, finish: QualifierFinish) =>
  rule.producerId === finish.producerId && rule.seasonId === finish.seasonId &&
  rule.classId === finish.classId && rule.ropingId === finish.ropingId &&
  rule.stage === finish.stage && rule.round === finish.round;
const positiveInteger = (value: number) => Number.isSafeInteger(value) && value > 0;
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function validateFinalsQualificationRule(rule: FinalsQualificationRule): string[] {
  const errors: string[] = [];
  if (![rule.id, rule.producerId, rule.seasonId, rule.classId, rule.ropingId].every(Boolean)) errors.push("A producer, season, class, and roping are required.");
  if (!["go_round", "aggregate", "short_round"].includes(rule.stage)) errors.push("Choose a qualification stage.");
  if ((rule.stage === "go_round" && !positiveInteger(rule.round ?? 0)) || (rule.stage !== "go_round" && rule.round !== null)) errors.push("Choose a round only for a go-round award.");
  if (!["accumulate", "skip", "pass_down"].includes(rule.repeatPolicy)) errors.push("Choose a repeat-winner rule.");
  if (!["all", "staff_decision"].includes(rule.tiePolicy)) errors.push("Choose a tie rule.");
  if (rule.maximumPositions !== null && !positiveInteger(rule.maximumPositions)) errors.push("The position limit must be a positive whole number or unlimited.");
  if (!rule.places.length || rule.places.some((place) => !positiveInteger(place.place) || !positiveInteger(place.positions)) || new Set(rule.places.map((place) => place.place)).size !== rule.places.length) errors.push("Choose distinct places and positive whole position counts.");
  return errors;
}

/** Rebuild from official finishes rather than incrementing previously earned totals. */
export function calculateFinalsQualifications(
  rules: FinalsQualificationRule[], finishes: QualifierFinish[],
  manual: ManualFinalsPosition[] = [], moves: FinalsPositionMove[] = [],
  decisions: FinalsQualificationDecision[] = [],
) {
  const awards: FinalsPositionAward[] = [];
  const issues: FinalsQualificationIssue[] = [];
  const balances = new Map<string, number>();
  if (new Set(rules.map((rule) => rule.id)).size !== rules.length) throw new Error("Qualifier rule IDs must be unique.");
  const ruleGroups = new Set<string>();
  const usedFinishes = new Set<string>();
  for (const rule of rules) {
    const errors = validateFinalsQualificationRule(rule);
    if (errors.length) throw new Error(errors.join(" "));
    const key = JSON.stringify([rule.producerId, rule.seasonId, rule.classId, rule.ropingId, rule.stage, rule.round]);
    if (ruleGroups.has(key)) throw new Error("Configure each qualification stage once per roping.");
    ruleGroups.add(key);
  }
  for (const finish of finishes) {
    if (!finish.official || finish.place === null) continue;
    if (!positiveInteger(finish.place) || !validDate(finish.date)) throw new Error("Official finishes require a valid date and placing.");
    const key = JSON.stringify([finish.producerId, finish.ropingId, finish.stage, finish.round, finish.entryId]);
    if (usedFinishes.has(key)) throw new Error("A competition finish was supplied more than once.");
    usedFinishes.add(key);
  }
  const balance = (producer: string, season: string, member: string, classification: string) =>
    balances.get(accountKey(producer, season, member, classification)) ?? 0;
  function add(award: FinalsPositionAward) {
    awards.push(award);
    const key = accountKey(award.producerId, award.seasonId, award.memberId, award.classId);
    balances.set(key, (balances.get(key) ?? 0) + award.positions);
  }
  const ruleEvents = rules.flatMap((rule) => {
    const candidates = finishes.filter((finish) => finish.official && finish.place !== null && match(rule, finish));
    if (!candidates.length) return [];
    if (new Set(candidates.map((finish) => finish.date)).size !== 1) throw new Error("A qualifier stage must have one competition date.");
    const order = rule.stage === "go_round" ? rule.round! : rule.stage === "short_round" ? 10000 : 10001;
    return [{ date: candidates[0].date, order, id: rule.id, type: "rule" as const, rule, candidates }];
  });
  for (const item of manual) if (!validDate(item.date) || !positiveInteger(item.positions) || !item.reason.trim()) throw new Error("Manual positions require a date, position count, and reason.");
  for (const move of moves) if (!validDate(move.date) || !move.reason.trim() || move.fromClassId === move.toClassId || !["transfer", "revoke"].includes(move.decision)) throw new Error("A class move requires a distinct destination and a staff decision with a reason.");
  const events = [
    ...ruleEvents,
    ...manual.filter((item) => !item.revoked).map((item) => ({ date: item.date, order: -1, id: item.id, type: "manual" as const, item })),
    ...moves.map((move) => ({ date: move.date, order: -2, id: move.id, type: "move" as const, move })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.id.localeCompare(b.id));
  for (const event of events) {
    if (event.type === "manual") {
      const item = event.item;
      add({ id: `manual:${item.id}`, producerId: item.producerId, seasonId: item.seasonId, classId: item.classId,
        earnedClassId: item.classId, memberId: item.memberId, positions: item.positions, source: "manual", moves: [], revoked: false });
      continue;
    }
    if (event.type === "move") {
      const move = event.move;
      for (const award of awards.filter((award) => !award.revoked && award.producerId === move.producerId && award.seasonId === move.seasonId && award.memberId === move.memberId && award.classId === move.fromClassId)) {
        const oldKey = accountKey(move.producerId, move.seasonId, move.memberId, move.fromClassId);
        balances.set(oldKey, (balances.get(oldKey) ?? 0) - award.positions);
        award.moves.push(move.id);
        if (move.decision === "revoke") award.revoked = true;
        else {
          award.classId = move.toClassId;
          const newKey = accountKey(move.producerId, move.seasonId, move.memberId, move.toClassId);
          balances.set(newKey, (balances.get(newKey) ?? 0) + award.positions);
        }
      }
      continue;
    }
    const { rule, candidates } = event;
    const groups = new Map<number, QualifierFinish[]>();
    for (const candidate of candidates) {
      const place = candidate.place!;
      groups.set(place, [...(groups.get(place) ?? []), candidate]);
    }
    const places = [...groups.keys()].sort((a, b) => a - b);
    const claimed = new Set<string>();
    for (const allocation of [...rule.places].sort((a, b) => a.place - b.place)) {
      let awarded = false;
      let held = false;
      const ranks = rule.repeatPolicy === "pass_down" ? places.filter((place) => place >= allocation.place) : [allocation.place];
      for (const rank of ranks) {
        const group = groups.get(rank) ?? [];
        const context = JSON.stringify(finalsDecisionContext(group));
        const applicable = decisions.filter((decision) => decision.ruleId === rule.id && decision.place === allocation.place && JSON.stringify(decision.context) === context);
        const resolution = applicable.find((decision) => decision.kind === "tie");
        const revoked = new Set(applicable.filter((decision) => decision.kind === "revoke").flatMap((decision) => decision.entryIds));
        const eligible = group.filter((finish) => finish.memberId && !claimed.has(finish.entryId) && !revoked.has(finish.entryId) &&
          (!resolution || resolution.entryIds.includes(finish.entryId)) &&
          (rule.repeatPolicy === "accumulate" || balance(rule.producerId, rule.seasonId, finish.memberId, rule.classId) === 0) &&
          (rule.maximumPositions === null || balance(rule.producerId, rule.seasonId, finish.memberId, rule.classId) < rule.maximumPositions));
        if (!eligible.length) continue;
        if (group.length > 1 && rule.tiePolicy === "staff_decision" && !resolution) {
          issues.push({ ruleId: rule.id, place: allocation.place, reason: "tie_requires_decision", entryIds: group.map((finish) => finish.entryId) });
          held = true;
          break;
        }
        for (const finish of eligible) {
          const current = balance(rule.producerId, rule.seasonId, finish.memberId!, rule.classId);
          const positions = Math.min(allocation.positions, rule.maximumPositions === null ? allocation.positions : rule.maximumPositions - current);
          if (positions <= 0 || (rule.repeatPolicy !== "accumulate" && current > 0)) continue;
          add({ id: `finish:${rule.id}:${finish.entryId}`, producerId: rule.producerId, seasonId: rule.seasonId, classId: rule.classId,
            earnedClassId: rule.classId, memberId: finish.memberId!, positions, source: "finish", ruleId: rule.id,
            entryId: finish.entryId, ropingId: rule.ropingId, place: allocation.place, moves: [], revoked: false });
          claimed.add(finish.entryId);
          awarded = true;
        }
        if (awarded) break;
      }
      if (!awarded && !held) issues.push({ ruleId: rule.id, place: allocation.place, reason: "no_eligible_recipient", entryIds: [] });
    }
  }
  const totals = [...balances].filter(([, positions]) => positions > 0).map(([key, positions]) => {
    const [producerId, seasonId, memberId, classId] = JSON.parse(key) as string[];
    return { producerId, seasonId, memberId, classId, positions, eligible: true as const };
  });
  return { awards, totals, issues };
}
