import { describe, expect, it } from 'vitest';
import { analyzeExperiment, type OutcomeRow } from './experiment-analysis';

const policy = { minSubjectsPerVariant: 30, maxGuardrailIncreasePct: 3, confidenceThresholdPct: 95 };
function cohort(variant: OutcomeRow['variant'], subjects: number, conversions: number, breaches = 0): OutcomeRow[] {
  return Array.from({ length: subjects }, (_, index) => ({ variant, converted: index < conversions ? 1 : 0, guardrail_breached: index < breaches ? 1 : 0 }));
}

describe('sequential experiment analysis', () => {
  it('refuses causal claims with insufficient evidence', () => {
    const result = analyzeExperiment([...cohort('control', 10, 2), ...cohort('treatment', 10, 6)], policy);
    expect(result.decision).toBe('insufficient_data'); expect(result.causalClaimAllowed).toBe(false);
  });
  it('identifies a strong winner after the evidence floor', () => {
    const result = analyzeExperiment([...cohort('control', 200, 40), ...cohort('treatment', 200, 70)], policy);
    expect(result.decision).toBe('winner'); expect(result.absoluteLiftPct).toBe(15); expect(result.causalClaimAllowed).toBe(true);
  });
  it('identifies a harmful treatment', () => {
    const result = analyzeExperiment([...cohort('control', 200, 80), ...cohort('treatment', 200, 45)], policy);
    expect(result.decision).toBe('loser'); expect(result.absoluteLiftPct).toBeLessThan(0);
  });
  it('prioritizes guardrail rollback over primary-metric lift', () => {
    const result = analyzeExperiment([...cohort('control', 100, 20, 1), ...cohort('treatment', 100, 35, 10)], policy);
    expect(result.decision).toBe('guardrail_rollback'); expect(result.isConclusive).toBe(true);
  });
  it('never emits NaN for empty cohorts', () => {
    const result = analyzeExperiment([], policy);
    expect(Object.values(result.control).every(Number.isFinite)).toBe(true);
    expect(result.confidenceIntervalPct.every(Number.isFinite)).toBe(true);
  });
});
