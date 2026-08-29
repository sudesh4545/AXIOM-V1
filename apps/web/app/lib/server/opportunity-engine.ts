import type { Bottleneck, OpportunityCandidate, RiskLevel } from '../axiom-contract';

type Template = {
  suffix: string;
  title: string;
  description: string;
  focusMetric: string;
  upliftBase: number;
  riskLevel: RiskLevel;
  effort: OpportunityCandidate['effort'];
  reversibility: OpportunityCandidate['reversibility'];
  evidence: string[];
  assumptions: string[];
};

const templates: Record<string, Template[]> = {
  'Signup → Trial': [
    { suffix: 'guided-trial', title: 'Bring trial start into the first-session success path', description: 'Guide new users to a trial-start action immediately after signup.', focusMetric: 'Trial Conversion', upliftBase: 5.4, riskLevel: 'low', effort: 'small', reversibility: 'instant', evidence: ['Signup-to-trial is the weakest measured step', 'The change can be isolated inside onboarding'], assumptions: ['The new step reduces discovery friction without lowering signup quality.'] },
    { suffix: 'template-path', title: 'Offer a role-specific quick-start template', description: 'Preconfigure the first workspace from the user’s selected job-to-be-done.', focusMetric: 'Trial Conversion', upliftBase: 6.1, riskLevel: 'medium', effort: 'medium', reversibility: 'fast', evidence: ['New users are dropping before trial value is visible'], assumptions: ['Role selection is a useful proxy for first-value intent.'] },
    { suffix: 'value-preview', title: 'Preview first value before trial commitment', description: 'Show a personalized outcome preview before asking the user to begin the trial.', focusMetric: 'Trial Conversion', upliftBase: 4.7, riskLevel: 'low', effort: 'medium', reversibility: 'fast', evidence: ['The loss occurs before trial begins'], assumptions: ['A preview can communicate value without creating misleading claims.'] },
  ],
  'Trial → Activation': [
    { suffix: 'first-value', title: 'Move the first-value action earlier in onboarding', description: 'Test the shortest activation path for a bounded share of new trial users.', focusMetric: 'Activation Rate', upliftBase: 6.3, riskLevel: 'low', effort: 'small', reversibility: 'instant', evidence: ['Trial-to-activation is the weakest measured step', 'The affected population can be isolated'], assumptions: ['The shorter path preserves the required setup context.'] },
    { suffix: 'checklist', title: 'Replace generic onboarding with a success checklist', description: 'Sequence the three actions most correlated with activation.', focusMetric: 'Activation Rate', upliftBase: 7.1, riskLevel: 'medium', effort: 'medium', reversibility: 'fast', evidence: ['Activation loss is concentrated after trial start'], assumptions: ['Checklist completion remains a proxy until experimentally verified.'] },
    { suffix: 'assist', title: 'Trigger contextual help after stalled setup', description: 'Offer a contextual assist only when an eligible user stalls before activation.', focusMetric: 'Activation Rate', upliftBase: 4.9, riskLevel: 'low', effort: 'medium', reversibility: 'instant', evidence: ['The funnel shows a measurable activation constraint'], assumptions: ['Stall detection can be implemented without sensitive profiling.'] },
  ],
  'Activation → Collaboration': [
    { suffix: 'invite', title: 'Move team invitation into onboarding step 2', description: "Surface the 'Invite teammate' action inside onboarding step 2 for 10% of new trial users.", focusMetric: 'Activation Rate', upliftBase: 6.2, riskLevel: 'low', effort: 'small', reversibility: 'instant', evidence: ['Collaboration is the weakest measured step', 'Invitation discovery can be changed reversibly'], assumptions: ['Earlier invitation does not create notification fatigue.'] },
    { suffix: 'shared-template', title: 'Create a share-ready workspace template', description: 'Give activated users a useful artifact they can invite a teammate to review.', focusMetric: 'Collaboration Rate', upliftBase: 7.4, riskLevel: 'medium', effort: 'medium', reversibility: 'fast', evidence: ['The largest loss happens before the first collaboration action'], assumptions: ['The template has real standalone value for the invited teammate.'] },
    { suffix: 'invite-reminder', title: 'Add a single contextual invitation reminder', description: 'Show one reminder after activation when collaboration intent is strongest.', focusMetric: 'Collaboration Rate', upliftBase: 4.8, riskLevel: 'low', effort: 'small', reversibility: 'instant', evidence: ['Activated users are not completing the collaboration step'], assumptions: ['Frequency capping prevents repetitive prompts.'] },
  ],
};

const riskSafety = { low: 95, medium: 72, high: 38 } as const;
const effortCost = { small: 92, medium: 68, large: 42 } as const;
const reversibleBonus = { instant: 8, fast: 4, slow: 0 } as const;

function round1(value: number): number { return Number(value.toFixed(1)); }
function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

export function rankOpportunities(bottleneck: Bottleneck, observedUsers: number): OpportunityCandidate[] {
  const selectedTemplates = templates[bottleneck.stage] ?? templates['Trial → Activation'];
  const evidenceStrength = Math.min(94, Math.round(48 + Math.log10(Math.max(observedUsers, 1)) * 20));
  const pressure = Math.min(1.25, Math.max(0.75, bottleneck.dropOffPct / 50));
  const candidates = selectedTemplates.map((template) => {
    const predictedUpliftPct = round1(Math.min(12, template.upliftBase * pressure));
    const confidencePct = Math.min(88, Math.round(evidenceStrength - (template.riskLevel === 'medium' ? 6 : 0)));
    const expectedValue = round1(predictedUpliftPct * confidencePct / 10);
    const safety = riskSafety[template.riskLevel] + reversibleBonus[template.reversibility];
    const deliveryCost = effortCost[template.effort];
    const score = round1(expectedValue * 0.45 + evidenceStrength * 0.25 + safety * 0.2 + deliveryCost * 0.1);
    return {
      id: `opportunity-${slug(bottleneck.stage)}-${template.suffix}`,
      rank: 0,
      title: template.title,
      description: template.description,
      focusMetric: template.focusMetric,
      predictedUpliftPct,
      confidencePct,
      riskLevel: template.riskLevel,
      effort: template.effort,
      reversibility: template.reversibility,
      score,
      scoreBreakdown: { expectedValue, evidenceStrength, safety, deliveryCost },
      evidence: template.evidence,
      assumptions: template.assumptions,
      selected: false,
    } satisfies OpportunityCandidate;
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  return candidates.map((candidate, index) => ({ ...candidate, rank: index + 1, selected: index === 0 }));
}
