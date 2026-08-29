import { describe, expect, it } from 'vitest';
import type { Bottleneck } from '../axiom-contract';
import { rankOpportunities } from './opportunity-engine';

const bottleneck: Bottleneck = {
  stage: 'Activation → Collaboration', severity: 'medium', summary: 'Measured loss',
  dropOffPct: 54, evidenceWindowDays: 30,
  steps: [{ label: 'Activated', userCount: 20, conversionPct: 50, stepConversionPct: 50, widthPct: 50, isBottleneck: true }],
};

describe('opportunity engine', () => {
  it('returns three stable and uniquely ranked candidates', () => {
    const first = rankOpportunities(bottleneck, 40);
    const second = rankOpportunities(bottleneck, 40);
    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    expect(first.map((item) => item.rank)).toEqual([1, 2, 3]);
    expect(first.filter((item) => item.selected)).toHaveLength(1);
    expect(new Set(first.map((item) => item.id)).size).toBe(3);
  });

  it('raises evidence strength with a larger observed cohort', () => {
    const small = rankOpportunities(bottleneck, 10)[0];
    const large = rankOpportunities(bottleneck, 1000)[0];
    expect(large.confidencePct).toBeGreaterThan(small.confidencePct);
    expect(large.scoreBreakdown.evidenceStrength).toBeGreaterThan(small.scoreBreakdown.evidenceStrength);
  });

  it('keeps every proposal bounded and reversible', () => {
    for (const candidate of rankOpportunities(bottleneck, 40)) {
      expect(candidate.predictedUpliftPct).toBeGreaterThan(0);
      expect(candidate.predictedUpliftPct).toBeLessThanOrEqual(12);
      expect(candidate.reversibility).not.toBe('slow');
      expect(candidate.score).toBeGreaterThan(0);
    }
  });
});
