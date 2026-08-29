/**
 * AXIOM dashboard contract — TypeScript side.
 *
 * Yeh file `apps/api/app/schemas/dashboard.py` ka **exact mirror** hai.
 * Backend snake_case Python use karta hai, JSON camelCase mein aata hai
 * (Pydantic ka `alias_generator`), aur yeh types us camelCase JSON ko describe
 * karte hain.
 *
 * Isliye Day 1 ke hardcoded numbers hata kar bhi frontend type-safe rehta hai:
 * agar backend koi field rename kare aur yahan na kare, to `npm run build`
 * fail hoga — runtime pe chup-chaap `undefined` nahi milega.
 *
 * ⚠️ Backend contract badle to yeh file **saath mein** update karni hai. Do
 * jagah likhna ideal nahi hai; Day 26-28 pe OpenAPI schema se yeh types
 * auto-generate honge (`/openapi.json` already available hai).
 */

// --- Enums (backend `app/models/enums.py` se) ---

export type WorkspaceEnvironment = 'production' | 'staging' | 'sandbox';
export type DataSource = 'demo_seed' | 'ingested';
export type MetricUnit = 'inr' | 'percent' | 'count';
export type TrendDirection = 'up' | 'down' | 'flat';
export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';
export type RiskLevel = 'low' | 'medium' | 'high';
export type ExperimentStatus =
  | 'draft'
  | 'awaiting_approval'
  | 'running'
  | 'paused'
  | 'completed'
  | 'rolled_back';
export type DecisionOutcome = 'verified' | 'monitoring' | 'rolled_back' | 'inconclusive';

/** UI accent. Design system ke 4 tones — CSS class names inhi se bante hain. */
export type Tone = 'cyan' | 'violet' | 'blue' | 'pink';

// --- Workspace ---

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  environment: WorkspaceEnvironment;
  organizationName: string;
  objective: string | null;
}

export interface SystemStatus {
  /** healthy | degraded | down */
  state: string;
  label: string;
  message: string;
}

// --- KPI cards ---

export interface MetricCard {
  key: string;
  label: string;
  /** Server pe format hua string, e.g. "₹8.4L". Indian lakh/crore convention. */
  displayValue: string;
  /** Wahi number raw form mein — charts, sorting aur thresholds ke liye. */
  rawValue: number;
  unit: MetricUnit;
  deltaPct: number;
  direction: TrendDirection;
  /**
   * `direction` se **alag** hai. Churn neeche jaana `direction: 'down'` par
   * `isImprovement: true` hai. Colour isse decide karo, arrow se nahi.
   */
  isImprovement: boolean;
  tone: Tone;
  comparisonLabel: string;
  /** Sparkline ke normalised 0-100 points. */
  spark: number[];
}

// --- Growth chart ---

export interface GrowthPoint {
  label: string;
  value: number;
  /** ISO 8601, explicit UTC (`...Z`). */
  occurredOn: string;
}

export interface GrowthSeries {
  metricKey: string;
  metricLabel: string;
  rangeLabel: string;
  unit: MetricUnit;
  currentDisplay: string;
  /** Bar height = value / axisMax. Server bhejta hai taaki frontend guess na kare. */
  axisMax: number;
  axisLabels: string[];
  xAxisLabels: string[];
  points: GrowthPoint[];
}

// --- Bottleneck funnel ---

export interface FunnelStep {
  label: string;
  userCount: number;
  /** Funnel ke **pehle** step ke % mein. */
  conversionPct: number;
  /** Turant **pichhle** step ke % mein. Bottleneck isi se decide hota hai. */
  stepConversionPct: number;
  widthPct: number;
  isBottleneck: boolean;
}

export interface Bottleneck {
  stage: string;
  severity: SeverityLevel;
  summary: string;
  dropOffPct: number;
  steps: FunnelStep[];
  evidenceWindowDays: number;
}

// --- Recommendation + Reality Gate ---

export interface RealityGateCheck {
  label: string;
  passed: boolean;
  detail: string;
}

export interface RealityGate {
  passed: boolean;
  /** V1 mein always true — koi live experiment human approval ke bina nahi. */
  requiresHumanApproval: boolean;
  checks: RealityGateCheck[];
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  focusMetric: string;
  predictedUpliftPct: number;
  confidencePct: number;
  riskLevel: RiskLevel;
  trafficPct: number;
  durationDays: number;
  evidence: string[];
  assumptions: string[];
  realityGate: RealityGate;
  status: ExperimentStatus;
}

export interface OpportunityCandidate {
  id: string;
  rank: number;
  title: string;
  description: string;
  focusMetric: string;
  predictedUpliftPct: number;
  confidencePct: number;
  riskLevel: RiskLevel;
  effort: 'small' | 'medium' | 'large';
  reversibility: 'instant' | 'fast' | 'slow';
  score: number;
  scoreBreakdown: {
    expectedValue: number;
    evidenceStrength: number;
    safety: number;
    deliveryCost: number;
  };
  evidence: string[];
  assumptions: string[];
  selected: boolean;
}

// --- Active experiments ---

export interface ActiveExperiment {
  id: string;
  name: string;
  focusMetric: string;
  status: ExperimentStatus;
  progressPct: number;
  observedLiftPct: number;
  trafficPct: number;
  guardrailBreached: boolean;
  /** Sequential testing ke bina "significant" claim nahi karte. */
  isConclusive: boolean;
  analysis?: {
    controlSubjects: number;
    treatmentSubjects: number;
    probabilityTreatmentBetterPct: number;
    confidenceIntervalPct: [number, number];
    decision: 'insufficient_data' | 'continue' | 'winner' | 'loser' | 'guardrail_rollback';
    rationale: string;
  };
}

// --- Decision receipts ---

export interface DecisionReceiptSummary {
  id: string;
  title: string;
  decidedAt: string;
  decidedAtDisplay: string;
  outcome: DecisionOutcome;
  impactPct: number;
  summary: string;
}

// --- Top-level ---

export interface DashboardResponse {
  workspace: WorkspaceSummary;
  generatedAt: string;
  dataSource: DataSource;
  /** Honesty statement. UI mein dikhana **mandatory** hai, chhupana nahi. */
  dataSourceNote: string;
  operatorFirstName: string;
  systemStatus: SystemStatus;
  metrics: MetricCard[];
  growth: GrowthSeries;
  bottleneck: Bottleneck;
  recommendation: Recommendation;
  /** Day 12–15 deterministic, evidence-backed ranked intervention portfolio. */
  opportunities?: OpportunityCandidate[];
  experiments: ActiveExperiment[];
  decisions: DecisionReceiptSummary[];
  /** Signed-in Sites identity. Supplied only by the hosted same-origin API. */
  session?: {
    userId: string;
    email: string;
    displayName: string;
    authenticated: boolean;
    authMode: 'hosted_session' | 'local_development' | 'public_demo';
  };
  /** Server-authorized organization membership and switchable workspaces. */
  workspaceContext?: {
    id: string;
    name: string;
    slug: string;
    role: 'owner' | 'admin' | 'analyst' | 'viewer';
    availableWorkspaces: WorkspaceSummary[];
  };
  /** Honest, workspace-scoped event ingestion telemetry. */
  ingestion?: {
    totalEvents: number;
    uniqueUsers: number;
    lastEventAt: string | null;
    sources: Array<{
      source: string;
      status: 'connected' | 'idle';
      eventCount: number;
      lastEventAt: string | null;
    }>;
  };
  /** Day 6–10 governed measurement pipeline status and cohort evidence. */
  measurement?: {
    state: 'collecting' | 'measured';
    windowDays: number;
    observedUsers: number;
    recognizedEvents: number;
    requiredUsers: number;
    coveragePct: number;
    computedAt: string;
    retention: {
      day7Pct: number | null;
      day7EligibleUsers: number;
      day30Pct: number | null;
      day30EligibleUsers: number;
    };
    quality: {
      hasSignupSignal: boolean;
      hasActivationSignal: boolean;
      hasRevenueSignal: boolean;
      isSampled: boolean;
    };
  };
  riskPolicy?: {
    maxTrafficPct: number;
    minObservedUsers: number;
    minSubjectsPerVariant: number;
    confidenceThresholdPct: number;
    maxGuardrailIncreasePct: number;
    autoRollback: boolean;
  };
  /** Persistent snapshot state, useful for honest UI status and write feedback. */
  storage?: {
    state: 'connected';
    revision: number;
    lastSavedAt: string;
  };
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details: Record<string, unknown> | null;
}
