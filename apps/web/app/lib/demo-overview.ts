import type { DashboardResponse } from './axiom-contract';

export const DEMO_WORKSPACE_ID = 'axiom-demo';

const MRR_CURVE = [20, 29, 38, 33, 39, 48, 43, 52, 51, 64, 54, 61, 70, 67, 74, 72, 80, 77, 84];

function compactDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function decisionDate(daysAgo: number, hour: number, minute: number): { iso: string; display: string } {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return {
    iso: date.toISOString(),
    display: `Decided ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
  };
}

/**
 * Read-only demo workspace containing AXIOM's original sample dashboard.
 * It stays in the browser and is never persisted over a real workspace.
 */
export function createBundledDemoOverview(): DashboardResponse {
  const now = new Date();
  const firstPoint = new Date(now);
  firstPoint.setDate(firstPoint.getDate() - (MRR_CURVE.length - 1) * 2);

  const growthPoints = MRR_CURVE.map((percent, index) => {
    const occurredOn = new Date(firstPoint);
    occurredOn.setDate(firstPoint.getDate() + index * 2);
    return {
      label: compactDate(occurredOn),
      value: percent * 10_000,
      occurredOn: occurredOn.toISOString(),
    };
  });
  const labelIndexes = [0, 4, 7, 11, 14, 18];
  const firstDecision = decisionDate(2, 10, 32);
  const secondDecision = decisionDate(4, 16, 18);
  const thirdDecision = decisionDate(7, 9, 11);

  return {
    workspace: {
      id: DEMO_WORKSPACE_ID,
      name: 'Demo',
      slug: 'demo',
      environment: 'sandbox',
      organizationName: 'AXIOM Demo',
      objective: 'Explore AXIOM with the original sample growth dataset.',
    },
    generatedAt: now.toISOString(),
    dataSource: 'demo_seed',
    dataSourceNote: 'This is AXIOM sample data for demonstration only. Cloud and Sandbox data remain unchanged.',
    operatorFirstName: 'Sudesh',
    systemStatus: { state: 'healthy', label: 'Demo', message: 'Original sample data loaded' },
    metrics: [
      { key: 'mrr', label: 'MRR', displayValue: '₹8.4L', rawValue: 840000, unit: 'inr', deltaPct: 12.4, direction: 'up', isImprovement: true, tone: 'cyan', comparisonLabel: 'vs 7d prior', spark: [14, 20, 17, 29, 24, 39, 31, 46, 41, 53] },
      { key: 'activation_rate', label: 'Activation', displayValue: '38.6%', rawValue: 38.6, unit: 'percent', deltaPct: 4.2, direction: 'up', isImprovement: true, tone: 'violet', comparisonLabel: 'vs 7d prior', spark: [12, 19, 16, 28, 25, 36, 30, 44, 38, 53] },
      { key: 'trial_conversion', label: 'Trial Conversion', displayValue: '14.8%', rawValue: 14.8, unit: 'percent', deltaPct: 2.1, direction: 'up', isImprovement: true, tone: 'blue', comparisonLabel: 'vs 7d prior', spark: [10, 17, 14, 26, 20, 35, 29, 46, 38, 55] },
      { key: 'churn_rate', label: 'Attrition', displayValue: '3.2%', rawValue: 3.2, unit: 'percent', deltaPct: -0.6, direction: 'down', isImprovement: true, tone: 'pink', comparisonLabel: 'vs 7d prior', spark: [50, 43, 46, 36, 40, 30, 34, 22, 26, 14] },
    ],
    growth: {
      metricKey: 'mrr', metricLabel: 'MRR', rangeLabel: '30D', unit: 'inr', currentDisplay: '₹8.4L', axisMax: 1_000_000,
      axisLabels: ['₹10L', '₹7.5L', '₹5L', '₹2.5L', '₹0'],
      xAxisLabels: labelIndexes.map((index) => growthPoints[index].label),
      points: growthPoints,
    },
    bottleneck: {
      stage: 'Trial → Activation', severity: 'high', dropOffPct: 70.5, evidenceWindowDays: 30,
      summary: 'Trial → Activation is the largest single-step drop in the funnel.',
      steps: [
        { label: 'Signed up', userCount: 12846, conversionPct: 100, stepConversionPct: 100, widthPct: 100, isBottleneck: false },
        { label: 'Started trial', userCount: 5632, conversionPct: 43.9, stepConversionPct: 43.9, widthPct: 78, isBottleneck: false },
        { label: 'Activated', userCount: 1659, conversionPct: 12.9, stepConversionPct: 29.5, widthPct: 56, isBottleneck: true },
        { label: 'Invited teammate', userCount: 876, conversionPct: 6.8, stepConversionPct: 52.8, widthPct: 37, isBottleneck: false },
      ],
    },
    recommendation: {
      id: 'demo-recommendation-invite', title: 'Move team invitation into onboarding step 2',
      description: "Surface the 'Invite teammate' action inside onboarding step 2 for 10% of new trial users.",
      focusMetric: 'Activation Rate', predictedUpliftPct: 7.2, confidencePct: 76, riskLevel: 'low', trafficPct: 10, durationDays: 7,
      evidence: ['Invitation discovery is low', 'Team invites correlate with activation'],
      assumptions: ['The relationship is not yet causally verified'], status: 'awaiting_approval',
      realityGate: {
        passed: true, requiresHumanApproval: true,
        checks: [
          { label: 'Bounded traffic', passed: true, detail: '10% of new trial users only.' },
          { label: 'Reversible', passed: true, detail: 'Feature-flag controlled rollback.' },
          { label: 'No policy violations', passed: true, detail: 'No billing or privacy policy is touched.' },
        ],
      },
    },
    experiments: [
      { id: 'demo-exp-onboarding', name: 'Onboarding v2 – Step Order', focusMetric: 'Activation Rate', status: 'running', progressPct: 68, observedLiftPct: 4.1, trafficPct: 25, guardrailBreached: false, isConclusive: false },
      { id: 'demo-exp-pricing', name: 'Pricing Page – Value Prop', focusMetric: 'Trial Conversion', status: 'running', progressPct: 42, observedLiftPct: 2.7, trafficPct: 50, guardrailBreached: false, isConclusive: false },
      { id: 'demo-exp-invite', name: 'Nudge – Invite Teammate', focusMetric: 'Activation Rate', status: 'running', progressPct: 31, observedLiftPct: 1.9, trafficPct: 10, guardrailBreached: false, isConclusive: false },
    ],
    decisions: [
      { id: 'demo-decision-pricing', title: 'Enable redesigned pricing page', decidedAt: firstDecision.iso, decidedAtDisplay: firstDecision.display, outcome: 'verified', impactPct: 3.6, summary: 'Pricing redesign held a positive lift.' },
      { id: 'demo-decision-onboarding', title: 'Roll out onboarding v2 to 50%', decidedAt: secondDecision.iso, decidedAtDisplay: secondDecision.display, outcome: 'monitoring', impactPct: 1.2, summary: 'Positive direction; monitoring continues.' },
      { id: 'demo-decision-discount', title: 'Discount banner on homepage', decidedAt: thirdDecision.iso, decidedAtDisplay: thirdDecision.display, outcome: 'rolled_back', impactPct: -1.4, summary: 'Guardrail breach triggered rollback.' },
    ],
  };
}

/** Honest first-run state: no sample business data is persisted. */
export function createEmptyWorkspaceOverview(): DashboardResponse {
  const now = new Date().toISOString();
  return {
    workspace: {
      id: 'pending-workspace', name: 'Company workspace', slug: 'company-workspace', environment: 'production',
      organizationName: 'Company workspace', objective: 'Measure company growth using governed data.',
    },
    generatedAt: now,
    dataSource: 'ingested',
    dataSourceNote: 'Waiting for company data. Connect a source or upload events to begin measurement.',
    operatorFirstName: '',
    systemStatus: { state: 'healthy', label: 'Live', message: 'API and database connected' },
    metrics: [
      { key: 'mrr', label: 'MRR', displayValue: '—', rawValue: 0, unit: 'inr', deltaPct: 0, direction: 'flat', isImprovement: false, tone: 'cyan', comparisonLabel: 'waiting for data', spark: [0, 0] },
      { key: 'activation_rate', label: 'Activation', displayValue: '—', rawValue: 0, unit: 'percent', deltaPct: 0, direction: 'flat', isImprovement: false, tone: 'violet', comparisonLabel: 'waiting for data', spark: [0, 0] },
      { key: 'trial_conversion', label: 'Trial Conversion', displayValue: '—', rawValue: 0, unit: 'percent', deltaPct: 0, direction: 'flat', isImprovement: false, tone: 'blue', comparisonLabel: 'waiting for data', spark: [0, 0] },
      { key: 'churn_rate', label: 'Attrition', displayValue: '—', rawValue: 0, unit: 'percent', deltaPct: 0, direction: 'flat', isImprovement: false, tone: 'pink', comparisonLabel: 'waiting for data', spark: [0, 0] },
    ],
    growth: {
      metricKey: 'mrr', metricLabel: 'MRR', rangeLabel: '30D', unit: 'inr', currentDisplay: '—', axisMax: 1,
      axisLabels: ['₹0', '₹0', '₹0', '₹0', '₹0'], xAxisLabels: [], points: [],
    },
    bottleneck: {
      stage: 'Waiting for company data', severity: 'low', dropOffPct: 0, evidenceWindowDays: 30,
      summary: 'Upload or connect company events before AXIOM identifies a bottleneck.', steps: [],
    },
    recommendation: {
      id: 'connect-company-data', title: 'Connect your company data',
      description: 'Upload events or connect a source to unlock evidence-based recommendations.',
      focusMetric: 'Data readiness', predictedUpliftPct: 0, confidencePct: 0, riskLevel: 'low', trafficPct: 0, durationDays: 0,
      evidence: [], assumptions: [], status: 'awaiting_approval',
      realityGate: {
        passed: false, requiresHumanApproval: true,
        checks: [{ label: 'Company evidence', passed: false, detail: 'No governed company events have been measured yet.' }],
      },
    },
    experiments: [],
    decisions: [],
  };
}
