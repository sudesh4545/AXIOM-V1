import type { DashboardResponse } from './axiom-contract';

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
      evidence: [], assumptions: [], status: 'blocked',
      realityGate: {
        passed: false, requiresHumanApproval: true,
        checks: [{ label: 'Company evidence', passed: false, detail: 'No governed company events have been measured yet.' }],
      },
    },
    experiments: [],
    decisions: [],
  };
}
