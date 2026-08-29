import { describe, expect, it } from 'vitest';
import { runShadowSimulation } from './shadow-simulation';

const base = { baseConversionPct: 12.9, predictedUpliftPct: 7.2, trafficPct: 10, durationDays: 7, dailyEligibleUsers: 500, baselineGuardrailPct: 3.2, scenario: 'base' as const, iterations: 1000, seed: 'axiom-test' };

describe('CompanyGym-lite shadow simulation', () => {
  it('is deterministic, bounded and explicitly non-causal', () => {
    const first = runShadowSimulation(base); const second = runShadowSimulation(base);
    expect(first).toEqual(second); expect(first.expectedExposedUsers).toBe(350);
    expect(first.interval90Pct[0]).toBeLessThan(first.interval90Pct[1]);
    expect(first.assumptions.join(' ')).toContain('does not create causal evidence');
  });
  it('rejects unsafe parameters', () => expect(() => runShadowSimulation({ ...base, trafficPct: 101 })).toThrow(/trafficPct/));
  it('marks materially risky scenarios', () => {
    const result = runShadowSimulation({ ...base, scenario: 'aggressive', trafficPct: 100, predictedUpliftPct: -10 });
    expect(result.recommendation).toBe('do_not_launch'); expect(result.riskBand).not.toBe('low');
  });
});

