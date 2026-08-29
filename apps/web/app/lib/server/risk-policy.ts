import type { Recommendation } from '../axiom-contract';

export type WorkspaceRiskPolicy = { maxTrafficPct: number; minObservedUsers: number; minSubjectsPerVariant: number; confidenceThresholdPct: number; maxGuardrailIncreasePct: number; autoRollback: boolean };
export const DEFAULT_RISK_POLICY: WorkspaceRiskPolicy = { maxTrafficPct: 25, minObservedUsers: 10, minSubjectsPerVariant: 30, confidenceThresholdPct: 95, maxGuardrailIncreasePct: 3, autoRollback: true };

export function evaluatePreLaunch(recommendation: Recommendation, observedUsers: number, policy = DEFAULT_RISK_POLICY) {
  const checks = [
    { code: 'traffic_bound', passed: recommendation.trafficPct <= policy.maxTrafficPct, detail: `${recommendation.trafficPct}% requested; ${policy.maxTrafficPct}% maximum.` },
    { code: 'evidence_floor', passed: observedUsers >= policy.minObservedUsers, detail: `${observedUsers} users observed; ${policy.minObservedUsers} required.` },
    { code: 'human_approval', passed: recommendation.realityGate.requiresHumanApproval, detail: 'Explicit operator approval is mandatory.' },
    { code: 'reversible', passed: recommendation.realityGate.checks.some((check) => check.label.toLowerCase().includes('reversible') && check.passed), detail: 'A working feature-flag rollback path is required.' },
    { code: 'risk_ceiling', passed: recommendation.riskLevel !== 'high', detail: `${recommendation.riskLevel} recommendation risk.` },
  ];
  return { passed: checks.every((check) => check.passed), checks };
}
