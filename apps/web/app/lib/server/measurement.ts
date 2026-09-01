import { getDatabase } from '../../../db';
import type {
  Bottleneck, DashboardResponse, FunnelStep, GrowthSeries, MetricCard, Recommendation,
  OpportunityCandidate, SeverityLevel, TrendDirection,
} from '../axiom-contract';
import { isBusinessEvent } from './event-taxonomy';
import { rankOpportunities } from './opportunity-engine';

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 30;
const REQUIRED_USERS = 10;
const MAX_EVENTS = 50_000;

type EventRow = {
  event_type: string;
  event_name: string;
  anonymous_id: string | null;
  properties_json: string;
  occurred_at: string;
};

type NormalizedEvent = {
  eventType: string;
  eventName: string;
  userId: string | null;
  properties: Record<string, unknown>;
  occurredAt: Date;
  occurredMs: number;
};

type FunnelCounts = [number, number, number, number];

export type MeasurementComputation = {
  measurement: NonNullable<DashboardResponse['measurement']>;
  metrics?: MetricCard[];
  growth?: GrowthSeries;
  bottleneck?: Bottleneck;
  recommendation?: Recommendation;
  opportunities?: OpportunityCandidate[];
  dataSource?: DashboardResponse['dataSource'];
  dataSourceNote?: string;
};

function safeProperties(encoded: string): Record<string, unknown> {
  try {
    const value = JSON.parse(encoded) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function round1(value: number): number {
  return Number((Number.isFinite(value) ? value : 0).toFixed(1));
}

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? round1((numerator / denominator) * 100) : 0;
}

function direction(delta: number): TrendDirection {
  return delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
}

function relativeDelta(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return round1(((current - previous) / previous) * 100);
}

function compactDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatInr(value: number): string {
  if (value >= 10_000_000) return `₹${round1(value / 10_000_000)}Cr`;
  if (value >= 100_000) return `₹${round1(value / 100_000)}L`;
  if (value >= 1_000) return `₹${round1(value / 1_000)}K`;
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

function eventsInRange(events: NormalizedEvent[], startMs: number, endMs: number): NormalizedEvent[] {
  return events.filter((event) => event.occurredMs >= startMs && event.occurredMs < endMs);
}

function firstAfter(events: NormalizedEvent[], eventName: string, afterMs: number, beforeMs: number): number | null {
  const match = events.find((event) => event.eventName === eventName && event.occurredMs >= afterMs && event.occurredMs < beforeMs);
  return match?.occurredMs ?? null;
}

function funnelCounts(events: NormalizedEvent[], startMs: number, endMs: number): FunnelCounts {
  const byUser = new Map<string, NormalizedEvent[]>();
  for (const event of events) {
    if (!event.userId || event.occurredMs >= endMs) continue;
    const bucket = byUser.get(event.userId) ?? [];
    bucket.push(event);
    byUser.set(event.userId, bucket);
  }

  const counts: FunnelCounts = [0, 0, 0, 0];
  for (const userEvents of byUser.values()) {
    userEvents.sort((a, b) => a.occurredMs - b.occurredMs);
    const signup = firstAfter(userEvents, 'user_signed_up', startMs, endMs);
    if (signup === null) continue;
    counts[0] += 1;
    const trial = firstAfter(userEvents, 'trial_started', signup, endMs);
    if (trial === null) continue;
    counts[1] += 1;
    const activation = firstAfter(userEvents, 'activation_completed', trial, endMs);
    if (activation === null) continue;
    counts[2] += 1;
    const invite = firstAfter(userEvents, 'teammate_invited', activation, endMs);
    if (invite !== null) counts[3] += 1;
  }
  return counts;
}

function subscriptionStateAt(events: NormalizedEvent[], atMs: number): Map<string, { active: boolean; mrr: number }> {
  const state = new Map<string, { active: boolean; mrr: number }>();
  for (const event of events) {
    if (!event.userId || event.occurredMs > atMs) break;
    const current = state.get(event.userId) ?? { active: false, mrr: 0 };
    if (event.eventName === 'subscription_started') {
      const amount = Number(event.properties.monthlyAmountInr ?? event.properties.amountInr ?? 0);
      state.set(event.userId, { active: true, mrr: Number.isFinite(amount) ? amount : 0 });
    } else if (event.eventName === 'revenue_recorded') {
      const amount = Number(event.properties.monthlyAmountInr ?? event.properties.amountInr ?? current.mrr);
      state.set(event.userId, { active: current.active || amount > 0, mrr: Number.isFinite(amount) ? amount : current.mrr });
    } else if (event.eventName === 'subscription_cancelled') {
      state.set(event.userId, { ...current, active: false });
    }
  }
  return state;
}

function mrrAt(events: NormalizedEvent[], atMs: number): number {
  return [...subscriptionStateAt(events, atMs).values()].reduce((sum, account) => sum + (account.active ? account.mrr : 0), 0);
}

function churnBetween(events: NormalizedEvent[], startMs: number, endMs: number): number {
  const startState = subscriptionStateAt(events, startMs);
  const activeAtStart = new Set([...startState.entries()].filter(([, state]) => state.active).map(([userId]) => userId));
  if (activeAtStart.size === 0) return 0;
  const cancelled = new Set(eventsInRange(events, startMs, endMs)
    .filter((event) => event.eventName === 'subscription_cancelled' && event.userId && activeAtStart.has(event.userId))
    .map((event) => event.userId as string));
  return rate(cancelled.size, activeAtStart.size);
}

function trialConversion(events: NormalizedEvent[], startMs: number, endMs: number): number {
  const users = new Map<string, { trialAt?: number; subscribed: boolean }>();
  for (const event of events) {
    if (!event.userId || event.occurredMs < startMs || event.occurredMs >= endMs) continue;
    const state = users.get(event.userId) ?? { subscribed: false };
    if (event.eventName === 'trial_started' && state.trialAt === undefined) state.trialAt = event.occurredMs;
    if (event.eventName === 'subscription_started' && state.trialAt !== undefined && event.occurredMs >= state.trialAt) state.subscribed = true;
    users.set(event.userId, state);
  }
  const trials = [...users.values()].filter((state) => state.trialAt !== undefined);
  return rate(trials.filter((state) => state.subscribed).length, trials.length);
}

function retention(events: NormalizedEvent[], nowMs: number, targetDay: 7 | 30): { pct: number | null; eligible: number } {
  const maxAge = targetDay === 7 ? 60 : 120;
  const signupStart = nowMs - maxAge * DAY_MS;
  const signupEnd = nowMs - targetDay * DAY_MS;
  const byUser = new Map<string, NormalizedEvent[]>();
  for (const event of events) {
    if (!event.userId) continue;
    const bucket = byUser.get(event.userId) ?? [];
    bucket.push(event);
    byUser.set(event.userId, bucket);
  }

  let eligible = 0;
  let retained = 0;
  for (const userEvents of byUser.values()) {
    const signup = userEvents.find((event) => event.eventName === 'user_signed_up' && event.occurredMs >= signupStart && event.occurredMs < signupEnd);
    if (!signup) continue;
    eligible += 1;
    const activityStart = signup.occurredMs + targetDay * DAY_MS;
    const activityEnd = activityStart + 7 * DAY_MS;
    if (userEvents.some((event) => event.eventType === 'product' && event.occurredMs >= activityStart && event.occurredMs < activityEnd)) retained += 1;
  }
  return { pct: eligible > 0 ? rate(retained, eligible) : null, eligible };
}

function buildFunnel(counts: FunnelCounts): Bottleneck {
  const labels = ['Signed up', 'Started trial', 'Activated', 'Invited teammate'];
  const stages = ['Signup → Trial', 'Trial → Activation', 'Activation → Collaboration'];
  const first = counts[0];
  const stepRates = counts.map((count, index) => index === 0 ? 100 : rate(count, counts[index - 1]));
  let bottleneckIndex = 1;
  for (let index = 2; index < stepRates.length; index += 1) {
    if (stepRates[index] < stepRates[bottleneckIndex]) bottleneckIndex = index;
  }
  const dropOffPct = round1(100 - stepRates[bottleneckIndex]);
  const severity: SeverityLevel = dropOffPct >= 80 ? 'critical' : dropOffPct >= 60 ? 'high' : dropOffPct >= 40 ? 'medium' : 'low';
  const steps: FunnelStep[] = counts.map((count, index) => ({
    label: labels[index],
    userCount: count,
    conversionPct: first > 0 ? rate(count, first) : 0,
    stepConversionPct: stepRates[index],
    widthPct: first > 0 ? Math.max(12, rate(count, first)) : 12,
    isBottleneck: index === bottleneckIndex,
  }));
  const stage = stages[bottleneckIndex - 1];
  return {
    stage,
    severity,
    dropOffPct,
    evidenceWindowDays: WINDOW_DAYS,
    summary: `${stage} is the largest measured single-step drop in the latest ${WINDOW_DAYS}-day funnel.`,
    steps,
  };
}

function recommendationFor(bottleneck: Bottleneck, observedUsers: number): Recommendation {
  const variants: Record<string, { title: string; description: string; focusMetric: string; evidence: string[] }> = {
    'Signup → Trial': {
      title: 'Bring trial start into the first-session success path',
      description: 'Test a guided trial-start action immediately after signup for a bounded share of new users.',
      focusMetric: 'Trial Conversion',
      evidence: ['Signup-to-trial is the weakest measured step', 'The intervention stays inside onboarding'],
    },
    'Trial → Activation': {
      title: 'Move the first-value action earlier in onboarding',
      description: 'Test the shortest activation path for 10% of new trial users before widening exposure.',
      focusMetric: 'Activation Rate',
      evidence: ['Trial-to-activation is the weakest measured step', 'The affected population can be isolated'],
    },
    'Activation → Collaboration': {
      title: 'Move team invitation into onboarding step 2',
      description: "Surface the 'Invite teammate' action inside onboarding step 2 for 10% of new trial users.",
      focusMetric: 'Activation Rate',
      evidence: ['Collaboration is the weakest measured step', 'Invitation discovery can be changed reversibly'],
    },
  };
  const variant = variants[bottleneck.stage] ?? variants['Trial → Activation'];
  const slug = bottleneck.stage.toLowerCase().replace(/[^a-z]+/g, '-').replace(/(^-|-$)/g, '');
  return {
    id: `measured-${slug}`,
    title: variant.title,
    description: variant.description,
    focusMetric: variant.focusMetric,
    predictedUpliftPct: round1(Math.min(10, 3.5 + bottleneck.dropOffPct * 0.06)),
    confidencePct: Math.min(88, Math.max(55, Math.round(55 + Math.log10(Math.max(observedUsers, 1)) * 15))),
    riskLevel: 'low',
    trafficPct: 10,
    durationDays: 7,
    evidence: variant.evidence,
    assumptions: ['The measured relationship is diagnostic and is not yet causally verified.'],
    status: 'awaiting_approval',
    realityGate: {
      passed: true,
      requiresHumanApproval: true,
      checks: [
        { label: 'Bounded traffic', passed: true, detail: '10% of new trial users only.' },
        { label: 'Reversible', passed: true, detail: 'Feature-flag controlled rollback.' },
        { label: 'Measured evidence', passed: true, detail: `${observedUsers} users observed in the governed dataset.` },
      ],
    },
  };
}

export function computeMeasurement(rows: EventRow[], now = new Date()): MeasurementComputation {
  const nowMs = now.getTime();
  const events = rows.map((row) => {
    const occurredAt = new Date(row.occurred_at);
    return {
      eventType: row.event_type,
      eventName: row.event_name,
      userId: row.anonymous_id,
      properties: safeProperties(row.properties_json),
      occurredAt,
      occurredMs: occurredAt.getTime(),
    };
  }).filter((event) => Number.isFinite(event.occurredMs)).sort((a, b) => a.occurredMs - b.occurredMs);

  const businessEvents = events.filter((event) => isBusinessEvent(event.eventType, event.eventName));
  const observedUsers = new Set(businessEvents.map((event) => event.userId).filter(Boolean)).size;
  const recognizedEvents = businessEvents.length;
  const hasSignupSignal = businessEvents.some((event) => event.eventName === 'user_signed_up');
  const hasActivationSignal = businessEvents.some((event) => event.eventName === 'activation_completed');
  const hasRevenueSignal = businessEvents.some((event) => ['subscription_started', 'revenue_recorded'].includes(event.eventName));
  const coveragePct = Math.min(100, Math.round((observedUsers / REQUIRED_USERS) * 100));
  const day7 = retention(events, nowMs, 7);
  const day30 = retention(events, nowMs, 30);
  const measured = observedUsers >= REQUIRED_USERS && hasSignupSignal && hasActivationSignal;

  const measurement: NonNullable<DashboardResponse['measurement']> = {
    state: measured ? 'measured' : 'collecting',
    windowDays: WINDOW_DAYS,
    observedUsers,
    recognizedEvents,
    requiredUsers: REQUIRED_USERS,
    coveragePct,
    computedAt: now.toISOString(),
    retention: {
      day7Pct: day7.pct,
      day7EligibleUsers: day7.eligible,
      day30Pct: day30.pct,
      day30EligibleUsers: day30.eligible,
    },
    quality: { hasSignupSignal, hasActivationSignal, hasRevenueSignal, isSampled: rows.length >= MAX_EVENTS },
  };
  if (!measured) return { measurement };

  const windowStart = nowMs - WINDOW_DAYS * DAY_MS;
  const previousStart = windowStart - WINDOW_DAYS * DAY_MS;
  const counts = funnelCounts(events, windowStart, nowMs + 1);
  const previousCounts = funnelCounts(events, previousStart, windowStart);
  const bottleneck = buildFunnel(counts);
  const opportunities = rankOpportunities(bottleneck, observedUsers);
  const currentMrr = mrrAt(events, nowMs);
  const previousMrr = mrrAt(events, nowMs - 7 * DAY_MS);
  const activationRate = rate(counts[2], counts[0]);
  const previousActivation = rate(previousCounts[2], previousCounts[0]);
  const conversionRate = trialConversion(events, windowStart, nowMs + 1);
  const previousConversion = trialConversion(events, previousStart, windowStart);
  const churnRate = churnBetween(events, windowStart, nowMs + 1);
  const previousChurn = churnBetween(events, previousStart, windowStart);

  const pointDates = Array.from({ length: 19 }, (_, index) => new Date(windowStart + index * ((WINDOW_DAYS * DAY_MS) / 18)));
  const growthPoints = pointDates.map((date) => ({ label: compactDate(date), value: Math.round(mrrAt(events, date.getTime())), occurredOn: date.toISOString() }));
  const maxMrr = Math.max(currentMrr, ...growthPoints.map((point) => point.value), 1);
  const axisMax = Math.max(100_000, Math.ceil(maxMrr / 100_000) * 100_000);
  const labelIndexes = [0, 4, 7, 11, 14, 18];
  const sparkDates = Array.from({ length: 10 }, (_, index) => nowMs - (9 - index) * 3 * DAY_MS);
  const activationSpark = sparkDates.map((end) => {
    const value = funnelCounts(events, end - 7 * DAY_MS, end + 1);
    return rate(value[2], value[0]);
  });
  const conversionSpark = sparkDates.map((end) => trialConversion(events, end - 7 * DAY_MS, end + 1));
  const churnSpark = sparkDates.map((end) => churnBetween(events, end - 30 * DAY_MS, end + 1));
  const mrrDelta = relativeDelta(currentMrr, previousMrr);
  const activationDelta = round1(activationRate - previousActivation);
  const conversionDelta = round1(conversionRate - previousConversion);
  const churnDelta = round1(churnRate - previousChurn);

  const metrics: MetricCard[] = [
    { key: 'mrr', label: 'MRR', displayValue: formatInr(currentMrr), rawValue: currentMrr, unit: 'inr', deltaPct: mrrDelta, direction: direction(mrrDelta), isImprovement: mrrDelta >= 0, tone: 'cyan', comparisonLabel: 'vs 7d prior', spark: sparkDates.map((date) => mrrAt(events, date)) },
    { key: 'activation_rate', label: 'Activation', displayValue: `${activationRate}%`, rawValue: activationRate, unit: 'percent', deltaPct: activationDelta, direction: direction(activationDelta), isImprovement: activationDelta >= 0, tone: 'violet', comparisonLabel: 'vs prior 30d', spark: activationSpark },
    { key: 'trial_conversion', label: 'Trial Conversion', displayValue: `${conversionRate}%`, rawValue: conversionRate, unit: 'percent', deltaPct: conversionDelta, direction: direction(conversionDelta), isImprovement: conversionDelta >= 0, tone: 'blue', comparisonLabel: 'vs prior 30d', spark: conversionSpark },
    { key: 'churn_rate', label: 'Attrition', displayValue: `${churnRate}%`, rawValue: churnRate, unit: 'percent', deltaPct: churnDelta, direction: direction(churnDelta), isImprovement: churnDelta <= 0, tone: 'pink', comparisonLabel: 'vs prior 30d', spark: churnSpark },
  ];
  const growth: GrowthSeries = {
    metricKey: 'mrr', metricLabel: 'MRR', rangeLabel: '30D', unit: 'inr', currentDisplay: formatInr(currentMrr), axisMax,
    axisLabels: [axisMax, axisMax * 0.75, axisMax * 0.5, axisMax * 0.25, 0].map(formatInr),
    xAxisLabels: labelIndexes.map((index) => growthPoints[index].label),
    points: growthPoints,
  };
  return {
    measurement,
    metrics,
    growth,
    bottleneck,
    recommendation: recommendationFor(bottleneck, observedUsers),
    opportunities,
    dataSource: 'ingested',
    dataSourceNote: `Metrics are calculated from ${recognizedEvents.toLocaleString('en-IN')} governed events across ${observedUsers.toLocaleString('en-IN')} observed users in this workspace.`,
  };
}

export async function applyWorkspaceMeasurement(payload: DashboardResponse, workspaceId: string): Promise<void> {
  const result = await getDatabase().prepare(`SELECT event_type, event_name, anonymous_id, properties_json, occurred_at
    FROM ingested_events WHERE workspace_id = ? ORDER BY occurred_at ASC LIMIT ?`)
    .bind(workspaceId, MAX_EVENTS).all<EventRow>();
  const computed = computeMeasurement(result.results ?? []);
  payload.measurement = computed.measurement;
  if (!computed.metrics || !computed.growth || !computed.bottleneck || !computed.recommendation) {
    // Never present bundled demo numbers as a customer's business data. Until
    // the evidence gate has enough real events, show an honest collecting state.
    payload.dataSource = 'ingested';
    payload.dataSourceNote = `Waiting for company data: ${computed.measurement.observedUsers} users observed; ${computed.measurement.requiredUsers} required before metrics are calculated.`;
    payload.metrics = payload.metrics.map((metric) => ({ ...metric, displayValue: '—', rawValue: 0, deltaPct: 0, spark: metric.spark.map(() => 0) }));
    payload.growth = { ...payload.growth, currentDisplay: '—', points: payload.growth.points.map((point) => ({ ...point, value: 0 })), axisLabels: payload.growth.axisLabels.map(() => '₹0') };
    payload.bottleneck = { ...payload.bottleneck, stage: 'Waiting for company data', severity: 'low', evidence: ['Upload company events to begin analysis.'] };
    payload.recommendation = { ...payload.recommendation, title: 'Connect your company data', summary: 'Import at least 10 users and their key events to unlock recommendations.', predictedUpliftPct: 0 };
    return;
  }

  payload.metrics = computed.metrics;
  payload.growth = computed.growth;
  payload.bottleneck = computed.bottleneck;
  const approved = payload.experiments.some((experiment) => experiment.id === `approved-${computed.recommendation?.id}`);
  computed.recommendation.status = approved ? 'running' : 'awaiting_approval';
  payload.recommendation = computed.recommendation;
  payload.opportunities = computed.opportunities;
  payload.dataSource = computed.dataSource ?? 'ingested';
  payload.dataSourceNote = computed.dataSourceNote ?? payload.dataSourceNote;
  payload.generatedAt = computed.measurement.computedAt;
}
