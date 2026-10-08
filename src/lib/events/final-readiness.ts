export interface ReadinessRoping {
  id: string;
  name: string;
  pending: number;
  reruns: number;
  shortRoundIssue: boolean;
  payoutIssues: string[];
}
export interface FinalReadiness {
  ropings: ReadinessRoping[];
  blocked: boolean;
  pending: number;
  reruns: number;
  payoutsDueCents?: number;
  unconfirmedReceipts?: number;
  paymentCheckMessage?: string;
}
export function summarizeReadiness(ropings: ReadinessRoping[]): FinalReadiness {
  const pending = ropings.reduce((total, roping) => total + roping.pending, 0);
  const reruns = ropings.reduce((total, roping) => total + roping.reruns, 0);
  return { ropings, pending, reruns, blocked: Boolean(pending || reruns || ropings.some((roping) => roping.shortRoundIssue)) };
}
