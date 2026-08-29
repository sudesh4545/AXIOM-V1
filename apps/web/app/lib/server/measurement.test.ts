import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../db', () => ({ getDatabase: vi.fn() }));

type Row = {
  event_type: string;
  event_name: string;
  anonymous_id: string | null;
  properties_json: string;
  occurred_at: string;
};

const NOW = new Date('2026-08-29T12:00:00.000Z');
const DAY = 86_400_000;
let computeMeasurement: typeof import('./measurement').computeMeasurement;

beforeAll(async () => {
  ({ computeMeasurement } = await import('./measurement'));
});

function row(user: string | null, name: string, daysAgo: number, properties: Record<string, unknown> = {}, type?: string): Row {
  return {
    event_type: type ?? (name.startsWith('subscription_') || name === 'revenue_recorded' ? 'revenue' : 'lifecycle'),
    event_name: name,
    anonymous_id: user,
    properties_json: JSON.stringify(properties),
    occurred_at: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
  };
}

function measuredCohort(count = 10): Row[] {
  return Array.from({ length: count }, (_, index) => {
    const user = `user-${index + 1}`;
    return [
      row(user, 'user_signed_up', 20),
      row(user, 'trial_started', 19.9),
      row(user, 'activation_completed', 19.8),
      row(user, 'teammate_invited', 19.7),
    ];
  }).flat();
}

describe('measurement engine', () => {
  it('stays collecting until the evidence gate is met', () => {
    const empty = computeMeasurement([], NOW);
    expect(empty.measurement).toMatchObject({ state: 'collecting', observedUsers: 0, coveragePct: 0 });
    expect(empty.metrics).toBeUndefined();

    const nine = computeMeasurement(measuredCohort(9), NOW);
    expect(nine.measurement).toMatchObject({ state: 'collecting', observedUsers: 9, coveragePct: 90 });
  });

  it('switches to measured output with finite KPIs', () => {
    const result = computeMeasurement(measuredCohort(), NOW);
    expect(result.measurement.state).toBe('measured');
    expect(result.dataSource).toBe('ingested');
    expect(result.metrics).toHaveLength(4);
    expect(result.metrics?.every((metric) => Number.isFinite(metric.rawValue) && Number.isFinite(metric.deltaPct))).toBe(true);
    expect(result.bottleneck?.steps.map((step) => step.userCount)).toEqual([10, 10, 10, 10]);
  });

  it('requires sequential funnel order and ignores pre-signup actions', () => {
    const rows = measuredCohort();
    rows.push(row('wrong-order', 'activation_completed', 21), row('wrong-order', 'user_signed_up', 20));
    const result = computeMeasurement(rows, NOW);
    expect(result.bottleneck?.steps.map((step) => step.userCount)).toEqual([11, 10, 10, 10]);
  });

  it('finds the weakest measured step', () => {
    const rows: Row[] = [];
    for (let index = 0; index < 20; index += 1) {
      const user = `funnel-${index}`;
      rows.push(row(user, 'user_signed_up', 20), row(user, 'trial_started', 19));
      if (index < 8) rows.push(row(user, 'activation_completed', 18));
      if (index < 4) rows.push(row(user, 'teammate_invited', 17));
    }
    const result = computeMeasurement(rows, NOW);
    expect(result.bottleneck).toMatchObject({ stage: 'Trial → Activation', dropOffPct: 60, severity: 'high' });
    expect(result.recommendation?.trafficPct).toBe(10);
    expect(result.recommendation?.realityGate.requiresHumanApproval).toBe(true);
  });

  it('calculates active MRR and ignores cancelled subscriptions', () => {
    const rows = measuredCohort();
    rows.push(
      row('user-1', 'subscription_started', 15, { monthlyAmountInr: 2500 }),
      row('user-2', 'subscription_started', 15, { monthlyAmountInr: 4000 }),
      row('user-2', 'subscription_cancelled', 2),
      row('user-3', 'revenue_recorded', 1, { amountInr: 1500 }),
    );
    const result = computeMeasurement(rows, NOW);
    expect(result.metrics?.find((metric) => metric.key === 'mrr')?.rawValue).toBe(4000);
  });

  it('uses only paid-at-window-start accounts as churn denominator', () => {
    const rows = measuredCohort();
    rows.push(
      row('old-paid-1', 'subscription_started', 40, { monthlyAmountInr: 1000 }),
      row('old-paid-2', 'subscription_started', 40, { monthlyAmountInr: 1000 }),
      row('old-paid-1', 'subscription_cancelled', 5),
      row('new-paid', 'subscription_started', 5, { monthlyAmountInr: 1000 }),
      row('new-paid', 'subscription_cancelled', 1),
    );
    const churn = computeMeasurement(rows, NOW).metrics?.find((metric) => metric.key === 'churn_rate');
    expect(churn?.rawValue).toBe(50);
  });

  it('counts conversion only when subscription follows trial', () => {
    const rows = measuredCohort();
    rows.push(
      row('user-1', 'subscription_started', 21, { monthlyAmountInr: 1000 }),
      row('user-2', 'subscription_started', 10, { monthlyAmountInr: 1000 }),
    );
    const conversion = computeMeasurement(rows, NOW).metrics?.find((metric) => metric.key === 'trial_conversion');
    expect(conversion?.rawValue).toBe(10);
  });

  it('computes D7 and D30 retention from eligible cohorts', () => {
    const rows = measuredCohort();
    rows.push(
      row('retained-7', 'user_signed_up', 10), row('retained-7', 'workspace_opened', 3, {}, 'product'),
      row('lost-7', 'user_signed_up', 10),
      row('retained-30', 'user_signed_up', 40), row('retained-30', 'workspace_opened', 9, {}, 'product'),
      row('lost-30', 'user_signed_up', 40),
    );
    const retention = computeMeasurement(rows, NOW).measurement.retention;
    expect(retention.day7EligibleUsers).toBeGreaterThanOrEqual(2);
    expect(retention.day7Pct).not.toBeNull();
    expect(retention.day30EligibleUsers).toBe(2);
    expect(retention.day30Pct).toBe(50);
  });

  it('survives malformed stored properties and dates', () => {
    const rows = measuredCohort();
    rows.push({ ...row('user-1', 'revenue_recorded', 1), properties_json: '{bad-json' });
    rows.push({ ...row('ghost', 'user_signed_up', 1), occurred_at: 'not-a-date' });
    const result = computeMeasurement(rows, NOW);
    expect(result.metrics?.every((metric) => Number.isFinite(metric.rawValue))).toBe(true);
    expect(result.measurement.observedUsers).toBe(10);
  });
});
