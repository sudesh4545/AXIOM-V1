export type SimulationScenario = 'conservative' | 'base' | 'aggressive';

export interface SimulationInput {
  baseConversionPct: number;
  predictedUpliftPct: number;
  trafficPct: number;
  durationDays: number;
  dailyEligibleUsers: number;
  baselineGuardrailPct: number;
  scenario: SimulationScenario;
  iterations: number;
  seed: string;
}

export interface SimulationResult {
  expectedExposedUsers: number;
  expectedIncrementalConversions: number;
  medianLiftPct: number;
  interval90Pct: [number, number];
  probabilityPositivePct: number;
  probabilityGuardrailBreachPct: number;
  riskBand: 'low' | 'medium' | 'high';
  recommendation: 'proceed_to_review' | 'tighten_scope' | 'do_not_launch';
  assumptions: string[];
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

function randomFactory(seed: string): () => number {
  let state = hashSeed(seed) || 1;
  return () => { state += 0x6D2B79F5; let value = state; value = Math.imul(value ^ (value >>> 15), value | 1); value ^= value + Math.imul(value ^ (value >>> 7), value | 61); return ((value ^ (value >>> 14)) >>> 0) / 4294967296; };
}

function normal(random: () => number): number {
  const u = Math.max(random(), Number.EPSILON); const v = Math.max(random(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function percentile(sorted: number[], fraction: number): number {
  const position = (sorted.length - 1) * fraction; const lower = Math.floor(position); const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function bounded(value: number, min: number, max: number, label: string): number {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be from ${min} to ${max}.`);
  return value;
}

export function runShadowSimulation(raw: SimulationInput): SimulationResult {
  const input = {
    ...raw,
    baseConversionPct: bounded(raw.baseConversionPct, 0.1, 99, 'baseConversionPct'),
    predictedUpliftPct: bounded(raw.predictedUpliftPct, -90, 500, 'predictedUpliftPct'),
    trafficPct: bounded(raw.trafficPct, 1, 100, 'trafficPct'),
    durationDays: bounded(raw.durationDays, 1, 90, 'durationDays'),
    dailyEligibleUsers: bounded(raw.dailyEligibleUsers, 1, 10_000_000, 'dailyEligibleUsers'),
    baselineGuardrailPct: bounded(raw.baselineGuardrailPct, 0, 100, 'baselineGuardrailPct'),
    iterations: Math.round(bounded(raw.iterations, 500, 20_000, 'iterations')),
  };
  if (!['conservative', 'base', 'aggressive'].includes(input.scenario)) throw new Error('scenario must be conservative, base or aggressive.');
  const random = randomFactory(input.seed);
  const exposedUsers = Math.max(1, Math.round(input.dailyEligibleUsers * input.durationDays * input.trafficPct / 100));
  const scenarioFactor = { conservative: 0.6, base: 1, aggressive: 1.25 }[input.scenario];
  const uncertainty = { conservative: 0.75, base: 0.55, aggressive: 0.9 }[input.scenario];
  const lifts: number[] = []; let positives = 0; let guardrailBreaches = 0;
  for (let index = 0; index < input.iterations; index += 1) {
    const lift = input.predictedUpliftPct * scenarioFactor + normal(random) * Math.max(2, Math.abs(input.predictedUpliftPct) * uncertainty);
    const guardrailDelta = normal(random) * (input.scenario === 'aggressive' ? 3.4 : input.scenario === 'conservative' ? 1.4 : 2.1) + Math.max(0, input.trafficPct - 25) / 20;
    lifts.push(lift); if (lift > 0) positives += 1; if (guardrailDelta > 3 || input.baselineGuardrailPct + guardrailDelta > 100) guardrailBreaches += 1;
  }
  lifts.sort((a, b) => a - b);
  const medianLift = percentile(lifts, 0.5); const positivePct = positives / input.iterations * 100; const guardrailPct = guardrailBreaches / input.iterations * 100;
  const riskBand = guardrailPct >= 30 ? 'high' : guardrailPct >= 12 ? 'medium' : 'low';
  const recommendation = positivePct < 60 || riskBand === 'high' ? 'do_not_launch' : positivePct < 80 || riskBand === 'medium' ? 'tighten_scope' : 'proceed_to_review';
  return {
    expectedExposedUsers: exposedUsers,
    expectedIncrementalConversions: Math.round(exposedUsers * input.baseConversionPct / 100 * medianLift / 100),
    medianLiftPct: Number(medianLift.toFixed(1)),
    interval90Pct: [Number(percentile(lifts, 0.05).toFixed(1)), Number(percentile(lifts, 0.95).toFixed(1))],
    probabilityPositivePct: Number(positivePct.toFixed(1)),
    probabilityGuardrailBreachPct: Number(guardrailPct.toFixed(1)),
    riskBand, recommendation,
    assumptions: ['Directional Monte Carlo model; it does not create causal evidence.', 'Traffic remains bounded to the submitted canary allocation.', 'Human approval and live guardrails remain mandatory after simulation.'],
  };
}

