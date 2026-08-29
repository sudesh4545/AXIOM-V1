export type OutcomeRow = { variant: 'control' | 'treatment'; converted: number; guardrail_breached: number };
export type VariantStats = { subjects: number; conversions: number; conversionRatePct: number; guardrailBreaches: number; guardrailRatePct: number };
export type AnalysisDecision = 'insufficient_data' | 'continue' | 'winner' | 'loser' | 'guardrail_rollback';
export type ExperimentAnalysis = {
  control: VariantStats; treatment: VariantStats; absoluteLiftPct: number; relativeLiftPct: number;
  probabilityTreatmentBetterPct: number; confidenceIntervalPct: [number, number]; decision: AnalysisDecision;
  isConclusive: boolean; causalClaimAllowed: boolean; rationale: string;
};

function round1(value: number): number { return Number((Number.isFinite(value) ? value : 0).toFixed(1)); }
function rate(n: number, d: number): number { return d ? n / d : 0; }
function erf(value: number): number {
  const sign = value < 0 ? -1 : 1; const x = Math.abs(value); const a = 0.147;
  const inner = 1 - Math.exp((-x * x * (4 / Math.PI + a * x * x)) / (1 + a * x * x));
  return sign * Math.sqrt(inner);
}
function normalCdf(value: number): number { return 0.5 * (1 + erf(value / Math.sqrt(2))); }
function stats(rows: OutcomeRow[], variant: OutcomeRow['variant']): VariantStats {
  const selected = rows.filter((row) => row.variant === variant);
  const conversions = selected.reduce((sum, row) => sum + (row.converted ? 1 : 0), 0);
  const guardrailBreaches = selected.reduce((sum, row) => sum + (row.guardrail_breached ? 1 : 0), 0);
  return { subjects: selected.length, conversions, conversionRatePct: round1(rate(conversions, selected.length) * 100), guardrailBreaches, guardrailRatePct: round1(rate(guardrailBreaches, selected.length) * 100) };
}

export function analyzeExperiment(rows: OutcomeRow[], policy: { minSubjectsPerVariant: number; maxGuardrailIncreasePct: number; confidenceThresholdPct: number }): ExperimentAnalysis {
  const control = stats(rows, 'control'); const treatment = stats(rows, 'treatment');
  const pC = rate(control.conversions, control.subjects); const pT = rate(treatment.conversions, treatment.subjects);
  const diff = pT - pC; const variance = rate(pT * (1 - pT), treatment.subjects) + rate(pC * (1 - pC), control.subjects);
  const standardError = Math.sqrt(Math.max(variance, 0)); const z = standardError > 0 ? diff / standardError : 0;
  const probability = round1(normalCdf(z) * 100); const margin = 1.96 * standardError * 100;
  const absoluteLiftPct = round1(diff * 100); const relativeLiftPct = pC > 0 ? round1((diff / pC) * 100) : pT > 0 ? 100 : 0;
  const guardrailIncrease = round1(treatment.guardrailRatePct - control.guardrailRatePct);
  const enough = control.subjects >= policy.minSubjectsPerVariant && treatment.subjects >= policy.minSubjectsPerVariant;
  let decision: AnalysisDecision = enough ? 'continue' : 'insufficient_data';
  let rationale = enough ? 'Evidence is still inside the sequential monitoring boundary.' : `At least ${policy.minSubjectsPerVariant} observed subjects per variant are required.`;
  if (enough && treatment.guardrailBreaches >= 3 && guardrailIncrease > policy.maxGuardrailIncreasePct) {
    decision = 'guardrail_rollback'; rationale = `Treatment guardrail rate is ${guardrailIncrease}% points above control.`;
  } else if (enough && probability >= policy.confidenceThresholdPct && absoluteLiftPct > 0) {
    decision = 'winner'; rationale = 'Treatment crossed the configured probability threshold with positive observed lift.';
  } else if (enough && probability <= 100 - policy.confidenceThresholdPct && absoluteLiftPct < 0) {
    decision = 'loser'; rationale = 'Treatment crossed the configured harm threshold with negative observed lift.';
  }
  const isConclusive = ['winner', 'loser', 'guardrail_rollback'].includes(decision);
  return { control, treatment, absoluteLiftPct, relativeLiftPct, probabilityTreatmentBetterPct: probability, confidenceIntervalPct: [round1(absoluteLiftPct - margin), round1(absoluteLiftPct + margin)], decision, isConclusive, causalClaimAllowed: enough && isConclusive, rationale };
}
