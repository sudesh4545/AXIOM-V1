import { describe, expect, it } from 'vitest';
import type { Recommendation } from '../axiom-contract';
import { evaluatePreLaunch } from './risk-policy';

const recommendation: Recommendation = { id:'r', title:'t', description:'d', focusMetric:'Activation', predictedUpliftPct:5, confidencePct:75, riskLevel:'low', trafficPct:10, durationDays:7, evidence:[], assumptions:[], status:'awaiting_approval', realityGate:{ passed:true, requiresHumanApproval:true, checks:[{ label:'Reversible', passed:true, detail:'Flag' }] } };
describe('risk policy', () => {
  it('passes a bounded reversible proposal', () => expect(evaluatePreLaunch(recommendation, 40).passed).toBe(true));
  it('blocks excessive traffic and weak evidence', () => {
    const result = evaluatePreLaunch({ ...recommendation, trafficPct: 80 }, 2);
    expect(result.passed).toBe(false); expect(result.checks.filter((check) => !check.passed).map((check) => check.code)).toEqual(['traffic_bound','evidence_floor']);
  });
  it('blocks high-risk or non-reversible proposals', () => {
    const result = evaluatePreLaunch({ ...recommendation, riskLevel:'high', realityGate:{ passed:true, requiresHumanApproval:true, checks:[] } }, 40);
    expect(result.passed).toBe(false);
  });
});
