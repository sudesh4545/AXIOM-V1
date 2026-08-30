'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  Activity, ArrowLeft, ArrowRight, BarChart3, Beaker, Bell, BrainCircuit,
  Building2, ChevronDown, CircleAlert, CircleCheckBig, CircleX, FlaskConical,
  Funnel, Home as HomeIcon, IndianRupee, Info, Moon, Network, Puzzle, ReceiptText,
  LogOut, Search, Send, Settings, ShieldCheck, Sparkles, Sun, Timer, Users, X, Zap,
  type LucideIcon,
} from 'lucide-react';

import { approveRecommendation, AxiomApiError, AxiomNetworkError, controlExperiment, loadOverview, selectWorkspace } from './lib/axiom-api';
import { AuthScreen } from './auth-screen';
import { firebaseAuth, firebaseAuthorizationHeader } from './lib/firebase-client';
import { SectionPages } from './section-pages';
import type {
  ActiveExperiment,
  Bottleneck,
  DashboardResponse,
  DecisionOutcome,
  DecisionReceiptSummary,
  GrowthSeries,
  MetricCard as MetricCardData,
  Recommendation,
  Tone,
} from './lib/axiom-contract';

/**
 * Day 1 pe is file mein saare numbers hardcoded the. Ab woh backend ke
 * `/api/v1/workspaces/{id}/dashboard` se aate hain.
 *
 * Yahan sirf **presentation** bachi hai — icons, layout, animation. Icons
 * deliberately frontend pe hain: woh design ka hissa hain, business data nahi.
 * API `key` bhejta hai (`"mrr"`), frontend decide karta hai kaunsa icon.
 */

const navItems: Array<{ icon: LucideIcon; label: string }> = [
  { icon: HomeIcon, label: 'Overview' },
  { icon: BrainCircuit, label: 'Intelligence' },
  { icon: FlaskConical, label: 'Experiments' },
  { icon: BarChart3, label: 'Analytics' },
  { icon: Network, label: 'Simulations' },
  { icon: ShieldCheck, label: 'Decisions' },
  { icon: Puzzle, label: 'Integrations' },
  { icon: Settings, label: 'Settings' },
];

const NAV_TARGET_IDS: Record<string, string> = {
  Overview: 'dashboard-overview',
  Intelligence: 'section-intelligence',
  Experiments: 'section-experiments',
  Analytics: 'section-analytics',
  Simulations: 'section-simulations',
  Decisions: 'section-decisions',
  Integrations: 'section-integrations',
  Settings: 'section-settings',
};

const DASHBOARD_CACHE_KEY = 'axiom-overview-cache-v1';
const DASHBOARD_CACHE_MAX_AGE_MS = 15 * 60 * 1000;

function readCachedOverview(userId: string): DashboardResponse | null {
  if (typeof window === 'undefined') return null;
  try {
    const cached = JSON.parse(window.localStorage.getItem(`${DASHBOARD_CACHE_KEY}:${userId}`) ?? 'null') as { savedAt?: number; payload?: DashboardResponse } | null;
    if (!cached?.payload || !cached.savedAt || Date.now() - cached.savedAt > DASHBOARD_CACHE_MAX_AGE_MS) return null;
    return cached.payload;
  } catch {
    return null;
  }
}

function cacheOverview(payload: DashboardResponse, userId: string): void {
  try {
    window.localStorage.setItem(`${DASHBOARD_CACHE_KEY}:${userId}`, JSON.stringify({ savedAt: Date.now(), payload }));
  } catch {
    // Storage can be disabled or full; the live dashboard still works normally.
  }
}

const NAV_SLUGS: Record<string, string> = {
  Overview: 'overview', Intelligence: 'intelligence', Experiments: 'experiments',
  Analytics: 'analytics', Simulations: 'simulations', Decisions: 'decisions',
  Integrations: 'integrations', Settings: 'settings',
};

const NAV_BY_SLUG = Object.fromEntries(Object.entries(NAV_SLUGS).map(([label, slug]) => [slug, label]));

type AxiomTheme = 'dark' | 'light' | 'neon';

/** Metric `key` -> icon. Naya metric aaya to fallback icon milta hai, crash nahi. */
const METRIC_ICONS: Record<string, LucideIcon> = {
  mrr: IndianRupee,
  activation_rate: Users,
  trial_conversion: Funnel,
  churn_rate: Activity,
};

const DECISION_TONES: Record<DecisionOutcome, string> = {
  verified: 'verified',
  monitoring: 'monitoring',
  rolled_back: 'rollback',
  inconclusive: 'monitoring',
};

const DECISION_MARKERS: Record<DecisionOutcome, LucideIcon> = {
  verified: CircleCheckBig,
  monitoring: Timer,
  rolled_back: CircleX,
  inconclusive: Timer,
};

/** "rolled_back" -> "Rolled back". Enum values UI labels ban jaate hain. */
function humanise(value: string): string {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Signed percentage. Negative pe proper minus sign (U+2212), hyphen nahi. */
function signedPct(value: number): string {
  return value < 0 ? `−${Math.abs(value)}%` : `+${value}%`;
}

function trendArrow(direction: MetricCardData['direction']): string {
  if (direction === 'up') return '↑';
  if (direction === 'down') return '↓';
  return '→';
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function Brand() {
  return (
    <div className="brand" aria-label="AXIOM V1">
      <span>A</span><b className="brand-x brand-x-v2" aria-hidden="true"><img src="/brand/axiom-mark-v2-256.png" width="40" height="40" alt="" /></b><span>IOM</span><em><b>V</b><span>1</span></em>
    </div>
  );
}

function FiberWave({ className = '' }: { className?: string }) {
  return (
    <div className={`fiber-wave ${className}`} aria-hidden="true">
      {Array.from({ length: 20 }, (_, index) => <i key={index} style={{ '--i': index } as CSSProperties} />)}
      {Array.from({ length: 18 }, (_, index) => <b key={index} style={{ '--i': index } as CSSProperties} />)}
    </div>
  );
}

function Sparkline({ tone, points }: { tone: Tone; points: number[] }) {
  // 105 / count => 10 points pe 10.5% spacing, exactly Day 1 design jaisa.
  const step = 105 / points.length;

  /*
    Spark values ko **normalise** karna zaroori hai.

    API raw numbers bhejta hai — churn: [50,43,46,36,40,30,34,22,26,14],
    MRR: [14,20,17,29,24,39,31,46,41,53]. Pehle yeh seedhe `bottom: 50%` ki
    tarah laga diye jaate the, matlab line box ki sirf 14%–53% height use karti
    thi. Browser mein measure kiya to 68px ke box mein saare dots bas 29px se
    59px ke beech the — poora upar ka aadha hissa khaali.

    Churn mein yeh sabse bura lagta tha: uska total movement 24px mein simat
    jaata, to woh ek dabi hui squiggle jaisi dikhti thi, trend saaf nahi tha.

    Fix: har series ko uske apne min–max se 0–100 pe stretch karo, phir 12%–88%
    ke band mein rakho (taaki dots box ke kinaron se na chipke). Line ka **shape
    bilkul same** rehta hai — bas poori available jagah use hoti hai, isliye
    trend clearly padha ja sakta hai.
  */
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1; // saari values same hon to divide-by-zero se bachao
  const scaled = points.map((value) => 12 + ((value - min) / span) * 76);

  /*
    Line ko **SVG polyline** se banate hain, CSS-rotated divs se nahi.

    Day 1 mein har dot ke `::after` pe ek rotated bar tha:
        --line-length: sqrt(x² + y²)px   (x = 11 hardcoded)
        --line-angle:  atan2(-y, x)deg
    Yahan `x` pixels mein tha aur `y` **percent** mein — do alag units ko ek
    hi triangle mein mila diya. Isliye length aur angle dono galat aate the:
    browser mein measure kiya to segment 12.4px @ 27.5deg tha jabki asli
    distance 11.7px @ 20deg thi. Segment next dot se aage nikal jaata, phir
    agla segment neeche se shuru hota — screen par aara (sawtooth) dikhta tha.

    SVG mein yeh problem hi nahi hoti: `viewBox="0 0 100 100"` +
    `preserveAspectRatio="none"` se coordinates seedhe box ke % ban jaate hain,
    aur browser khud exact line kheenchta hai — kisi trigonometry ki zaroorat
    nahi. `vector-effect="non-scaling-stroke"` isliye ki stretch hone par
    stroke ki thickness na badle.
  */
  const path = scaled.map((height, index) => `${index * step},${100 - height}`).join(' ');

  return (
    <div className={`sparkline ${tone}`} aria-hidden="true">
      <span className="spark-glow" />
      <svg className="spark-path" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline points={path} vectorEffect="non-scaling-stroke" />
      </svg>
      {scaled.map((height, index) => (
        <i key={index} style={{ left: `${index * step}%`, bottom: `${height}%`, '--delay': `${index * 70}ms` } as CSSProperties} />
      ))}
      {Array.from({ length: 14 }, (_, index) => <b key={index} style={{ '--i': index } as CSSProperties} />)}
    </div>
  );
}

function MetricCard({ metric, index }: { metric: MetricCardData; index: number }) {
  const Icon = METRIC_ICONS[metric.key] ?? Activity;
  return (
    <article className={`metric-card ${metric.tone}`} style={{ '--card-delay': `${index * 90}ms` } as CSSProperties}>
      <span className="metric-orb"><i /><Icon strokeWidth={1.8} /></span>
      <div className="metric-copy">
        <p>{metric.label}</p>
        <strong>{metric.displayValue}</strong>
        {/*
          Colour `isImprovement` se, arrow ki direction se **nahi**.
          `.negative` class laal hai. Day 1 mein churn ka "↓ 0.6%" laal dikhta
          tha — jabki churn girna acchi khabar hai. Yahi confusion is field ki
          wajah hai: down-arrow aur bad-news do alag cheezein hain.
        */}
        <small className={metric.isImprovement ? '' : 'negative'}>
          {trendArrow(metric.direction)} {Math.abs(metric.deltaPct)}%
        </small>
        <em>{metric.comparisonLabel}</em>
      </div>
      <Sparkline tone={metric.tone} points={metric.spark} />
      <span className="card-sheen" aria-hidden="true" />
    </article>
  );
}

function GrowthChart({ growth }: { growth: GrowthSeries }) {
  // Bar height = value / axisMax. `axisMax` server bhejta hai — frontend ko
  // guess karne dene se data badalne pe chart chup-chaap galat scale dikhata.
  const heights = growth.points.map((point) => (point.value / growth.axisMax) * 100);
  const step = 99.75 / heights.length; // 19 points => 5.25%, Day 1 design jaisa

  return (
    <div className="chart" aria-label={`${growth.metricLabel} growth chart, currently ${growth.currentDisplay}`}>
      <div className="chart-grid" /><div className="chart-aurora" />
      <div className="axis-values">{growth.axisLabels.map((label) => <span key={label}>{label}</span>)}</div>
      <div className="chart-bars" aria-hidden="true">{heights.map((height, index) => <i key={index} style={{ height: `${height}%`, '--bar-delay': `${index * 45}ms` } as CSSProperties} />)}</div>
      <div className="chart-particles" aria-hidden="true">{Array.from({ length: 52 }, (_, index) => <i key={index} style={{ '--i': index } as CSSProperties} />)}</div>
      <div className="chart-line" aria-hidden="true">
        {/* Wahi SVG approach jo Sparkline mein hai — yahan bug zyada dikh raha tha
            kyunki chart bada hai. `--segment-length` `vh` mein tha aur `* .55`
            jaisa magic number lagaya tha; woh sirf ek hi screen size pe theek
            baithta tha. SVG mein koi magic number nahi. */}
        <svg className="chart-path" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline points={heights.map((height, index) => `${index * step + 1},${100 - height}`).join(' ')} vectorEffect="non-scaling-stroke" />
        </svg>
        {heights.map((height, index) => (
          <i key={index} style={{ bottom: `${height}%`, left: `${index * step + 1}%`, '--point-delay': `${index * 55}ms` } as CSSProperties} />
        ))}
      </div>
      <span className="chart-value">{growth.currentDisplay}</span>
      <div className="chart-dates">{growth.xAxisLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div>
      <div className="chart-legend"><i /> {growth.metricLabel}</div>
    </div>
  );
}

function FunnelBars({ bottleneck }: { bottleneck: Bottleneck }) {
  return (
    <div className="funnel-bars">
      {bottleneck.steps.map((step) => (
        <div key={step.label} title={step.isBottleneck ? `Biggest single-step drop: only ${step.stepConversionPct}% of the previous step continue here` : `${step.stepConversionPct}% of the previous step`}>
          <span>{step.label}</span>
          <i style={{ '--funnel-width': `${step.widthPct}%` } as CSSProperties} />
          <b>{step.userCount.toLocaleString('en-IN')}</b>
          {/* `conversionPct` — pehle step ke % mein. Panel `stepConversionPct`
              ko tooltip mein dikhata hai, kyunki bottleneck usi se decide hota
              hai par cumulative % funnel padhne mein easier hai. */}
          <em>{step.conversionPct}%</em>
        </div>
      ))}
    </div>
  );
}

function ExperimentRow({ experiment, onSelect }: { experiment: ActiveExperiment; onSelect: () => void }) {
  return (
    <button className="experiment-row" type="button" onClick={onSelect}>
      <strong>{experiment.name}</strong>
      <span>{experiment.focusMetric}</span>
      <em><i />{humanise(experiment.status)}</em>
      <span className="progress"><i style={{ width: `${experiment.progressPct}%` }} /><b>{experiment.progressPct}%</b></span>
      <small>{signedPct(experiment.observedLiftPct)}</small>
    </button>
  );
}

function DecisionRow({ decision, onSelect }: { decision: DecisionReceiptSummary; onSelect: () => void }) {
  const Marker = DECISION_MARKERS[decision.outcome];
  return (
    <button className={`decision-row ${DECISION_TONES[decision.outcome]}`} type="button" onClick={onSelect}>
      <i className="decision-marker"><Marker /></i>
      <span><strong>{decision.title}</strong><small>{decision.decidedAtDisplay}</small></span>
      <em>{humanise(decision.outcome)}</em>
      <b>Impact</b>
      <small className="impact">{signedPct(decision.impactPct)}</small>
      <ArrowRight className="arrow" />
    </button>
  );
}

function ExperimentDetailModal({ experiment, onClose, onAnalyze, onControl, saving }: { experiment: ActiveExperiment; onClose: () => void; onAnalyze: () => void; onControl: (action: 'pause' | 'resume' | 'rollback') => void; saving: boolean }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="review-modal" role="dialog" aria-modal="true" aria-labelledby="experiment-detail-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close experiment details"><X /></button>
        <span className="modal-kicker"><Beaker /> ACTIVE EXPERIMENT</span>
        <h2 id="experiment-detail-title">{experiment.name}</h2>
        <p>Testing {experiment.focusMetric} on {experiment.trafficPct}% of eligible traffic. The result is {experiment.isConclusive ? 'ready for a decision' : 'still collecting evidence'}.</p>
        <div className="modal-metrics">
          <span><small>Progress</small><strong>{experiment.progressPct}%</strong></span>
          <span><small>Observed lift</small><strong>{signedPct(experiment.observedLiftPct)}</strong></span>
          <span><small>Status</small><strong>{humanise(experiment.status)}</strong></span>
        </div>
        <div className={`guardrail${experiment.guardrailBreached ? ' warning' : ''}`}>
          {experiment.guardrailBreached ? <CircleAlert /> : <ShieldCheck />}
          <span><b>{experiment.guardrailBreached ? 'Guardrail attention required' : 'Guardrails healthy'}</b><small>{experiment.isConclusive ? 'Evidence threshold reached' : 'Sequential test is still running'}</small></span>
        </div>
        {experiment.analysis && <div className="experiment-analysis-summary"><span><small>CONTROL / TREATMENT</small><b>{experiment.analysis.controlSubjects} / {experiment.analysis.treatmentSubjects}</b></span><span><small>P(TREATMENT BETTER)</small><b>{experiment.analysis.probabilityTreatmentBetterPct}%</b></span><span><small>95% INTERVAL</small><b>{experiment.analysis.confidenceIntervalPct[0]}% to {experiment.analysis.confidenceIntervalPct[1]}%</b></span><p>{experiment.analysis.rationale}</p></div>}
        <div className="modal-actions"><button type="button" onClick={onClose}>Close</button>{experiment.id.startsWith('approved-') && experiment.status !== 'rolled_back' && <button type="button" disabled={saving} onClick={() => onControl(experiment.status === 'paused' ? 'resume' : 'pause')}><Timer /> {experiment.status === 'paused' ? 'Resume' : 'Pause'}</button>}{experiment.id.startsWith('approved-') && experiment.status !== 'rolled_back' && <button type="button" disabled={saving} onClick={() => onControl('rollback')}><CircleX /> Roll back</button>}<button type="button" onClick={onAnalyze}><BrainCircuit /> Analyze with AXIOM</button></div>
      </section>
    </div>
  );
}

function DecisionDetailModal({ decision, onClose, onAnalyze }: { decision: DecisionReceiptSummary; onClose: () => void; onAnalyze: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="review-modal" role="dialog" aria-modal="true" aria-labelledby="decision-detail-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close decision receipt"><X /></button>
        <span className="modal-kicker"><ReceiptText /> DECISION RECEIPT</span>
        <h2 id="decision-detail-title">{decision.title}</h2>
        <p>{decision.summary}</p>
        <div className="modal-metrics">
          <span><small>Outcome</small><strong>{humanise(decision.outcome)}</strong></span>
          <span><small>Measured impact</small><strong>{signedPct(decision.impactPct)}</strong></span>
          <span><small>Decided</small><strong className="detail-date">{decision.decidedAtDisplay}</strong></span>
        </div>
        <div className="guardrail"><ShieldCheck /><span><b>Evidence receipt preserved</b><small>Decision remains traceable to its measured outcome</small></span></div>
        <div className="modal-actions"><button type="button" onClick={onClose}>Close</button><button type="button" onClick={onAnalyze}><BrainCircuit /> Ask AXIOM</button></div>
      </section>
    </div>
  );
}

function ReviewModal({
  recommendation,
  onClose,
  onApprove,
  saving,
}: {
  recommendation: Recommendation;
  onClose: () => void;
  onApprove: () => void | Promise<void>;
  saving: boolean;
}) {
  const gate = recommendation.realityGate;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="review-modal" role="dialog" aria-modal="true" aria-labelledby="review-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close review"><X /></button>
        <span className="modal-kicker"><Sparkles /> AXIOM EXPERIMENT PROPOSAL</span>
        <h2 id="review-title">{recommendation.title}</h2>
        <p>{recommendation.description}</p>
        <div className="modal-metrics">
          <span><small>Expected uplift</small><strong>{signedPct(recommendation.predictedUpliftPct)}</strong></span>
          <span><small>Confidence</small><strong>{recommendation.confidencePct}%</strong></span>
          <span><small>Risk</small><strong className={recommendation.riskLevel}>{humanise(recommendation.riskLevel)}</strong></span>
        </div>
        {/*
          Reality Gate ke checks server pe **deterministic code** hain, AI se
          poochhe hue nahi. Isliye inhe yahan naam se dikhana safe hai — yeh
          model ka output nahi, policy engine ka output hai.
        */}
        <div className="guardrail">
          <ShieldCheck />
          <span>
            <b>Reality Gate {gate.passed ? 'passed' : 'failed'}</b>
            <small title={gate.checks.map((check) => `${check.label}: ${check.detail}`).join('\n')}>
              {gate.checks.map((check) => check.label).join(' · ')}
            </small>
          </span>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Not now</button>
          {/* V1 mein `requiresHumanApproval` always true hai — yeh button hi woh
              human approval hai. Autonomous launch scope se bahar hai. */}
          <button type="button" onClick={onApprove} disabled={saving}><Zap /> {saving ? 'Saving approval…' : 'Approve canary'}</button>
        </div>
      </section>
    </div>
  );
}

/** Loading / error dono ek hi shell mein — layout jump nahi hota. */
function StatusShell({ title, message, hint }: { title: string; message: string; hint?: string }) {
  return (
    <main className="app-shell">
      <aside className="sidebar"><Brand /><FiberWave className="sidebar-wave" /></aside>
      <section className="workspace">
        <div className="dashboard">
          <section className="welcome-row"><div><h1>{title}</h1><p>{message}</p></div></section>
          {hint && <article className="panel"><p style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 1.7 }}>{hint}</p></article>}
        </div>
      </section>
    </main>
  );
}

export default function Home() {
  const [activeNav, setActiveNav] = useState('Overview');
  const [theme, setTheme] = useState<AxiomTheme>('neon');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [approvalSaving, setApprovalSaving] = useState(false);
  const [experimentActionSaving, setExperimentActionSaving] = useState(false);
  const [workspaceSwitching, setWorkspaceSwitching] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotQuery, setCopilotQuery] = useState('');
  const [copilotReply, setCopilotReply] = useState('');
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [spotlight, setSpotlight] = useState('');
  const [topbarMenu, setTopbarMenu] = useState<'workspace' | 'notifications' | 'profile' | null>(null);
  const [selectedExperiment, setSelectedExperiment] = useState<ActiveExperiment | null>(null);
  const [selectedDecision, setSelectedDecision] = useState<DecisionReceiptSummary | null>(null);
  const [toast, setToast] = useState('');
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const authEligible = Boolean(authUser && (!authUser.providerData.some((provider) => provider.providerId === 'password') || authUser.emailVerified));

  useEffect(() => onAuthStateChanged(firebaseAuth, (nextUser) => {
    setAuthUser(nextUser);
    setAuthReady(true);
    if (!nextUser) setData(null);
  }), []);

  useEffect(() => {
    const dismissFloatingPanels = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest('.topbar-popover, .workspace-select, .notification, .avatar')) setTopbarMenu(null);
      if (!target.closest('.search-shell')) setSearchQuery('');
    };
    document.addEventListener('pointerdown', dismissFloatingPanels);
    return () => document.removeEventListener('pointerdown', dismissFloatingPanels);
  }, []);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === 'Escape') { setReviewOpen(false); setCopilotOpen(false); setSearchQuery(''); setTopbarMenu(null); setSelectedExperiment(null); setSelectedDecision(null); }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);

  useEffect(() => {
    const syncViewFromUrl = () => {
      const requestedView = new URLSearchParams(window.location.search).get('view') ?? 'overview';
      setActiveNav(NAV_BY_SLUG[requestedView] ?? 'Overview');
    };
    syncViewFromUrl();
    window.addEventListener('popstate', syncViewFromUrl);
    return () => window.removeEventListener('popstate', syncViewFromUrl);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setSidebarCollapsed(window.localStorage.getItem('axiom-sidebar-collapsed') === 'true');
      const savedTheme = window.localStorage.getItem('axiom-theme');
      const initialTheme: AxiomTheme = savedTheme === 'dark' || savedTheme === 'light' || savedTheme === 'neon'
        ? savedTheme
        : window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      setTheme(initialTheme);
      document.documentElement.dataset.theme = initialTheme;
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!authUser || !authEligible) return;
    const frame = window.requestAnimationFrame(() => {
      const cached = readCachedOverview(authUser.uid);
      if (cached) setData(cached);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [authEligible, authUser]);

  useEffect(() => {
    if (!authUser || !authEligible) return;
    // `cancelled` flag isliye: component unmount hone ke baad `setState` call
    // karna React warning deta hai aur memory leak ka signal hai. React ke
    // StrictMode dev double-mount mein bhi yeh pehli fetch ko ignore kara deta.
    let cancelled = false;

    loadOverview()
      .then((payload) => { if (!cancelled) { cacheOverview(payload, authUser.uid); setData(payload); setError(null); } })
      .catch((cause: unknown) => {
        if (cancelled) return;
        if (cause instanceof AxiomNetworkError) {
          setError('AXIOM API se connect nahi ho paya');
          setHint('Please refresh the page. AXIOM will reconnect automatically.');
        } else if (cause instanceof AxiomApiError) {
          setError(`API error ${cause.status}: ${cause.message}`);
          setHint(null);
        } else {
          setError(cause instanceof Error ? cause.message : 'Unknown error');
          setHint('cd apps/api\npython -m scripts.seed');
        }
      });

    return () => { cancelled = true; };
  }, [authEligible, authUser]);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2200);
  }, []);

  const activateSection = useCallback((label: string) => {
    const targetId = NAV_TARGET_IDS[label];
    setActiveNav(label);
    setSpotlight(targetId);
    setSearchQuery('');
    setTopbarMenu(null);
    const nextUrl = new URL(window.location.href);
    if (label === 'Overview') nextUrl.searchParams.delete('view');
    else nextUrl.searchParams.set('view', NAV_SLUGS[label]);
    if (nextUrl.href !== window.location.href) window.history.pushState({ axiomView: label }, '', nextUrl);
    window.requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      target?.focus({ preventScroll: true });
      if (window.innerWidth <= 1200) target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    window.setTimeout(() => setSpotlight((current) => current === targetId ? '' : current), 1600);
    notify(`${label} workspace selected`);
  }, [notify]);

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem('axiom-sidebar-collapsed', String(next));
      return next;
    });
  };

  const selectTheme = (nextTheme: AxiomTheme) => {
    setTheme(nextTheme);
    window.localStorage.setItem('axiom-theme', nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    notify(`${nextTheme.charAt(0).toUpperCase() + nextTheme.slice(1)} appearance selected`);
  };

  const logout = async () => {
    if (authUser) window.localStorage.removeItem(`${DASHBOARD_CACHE_KEY}:${authUser.uid}`);
    window.sessionStorage.clear();
    setTopbarMenu(null);
    setData(null);
    await signOut(firebaseAuth);
  };

  if (!authReady) return <StatusShell title="Securing AXIOM…" message="Checking your verified identity" />;
  if (!authUser || !authEligible) return <AuthScreen theme={theme} user={authUser} onThemeChange={selectTheme} />;

  if (error) {
    return <StatusShell title="Dashboard unavailable" message={error} hint={hint ?? undefined} />;
  }
  if (!data) {
    return <StatusShell title="Loading AXIOM…" message="Fetching your growth system snapshot" />;
  }

  const { workspace, systemStatus, metrics, growth, bottleneck, recommendation, experiments, decisions } = data;
  const availableWorkspaces = data.workspaceContext?.availableWorkspaces ?? [workspace];
  const isDemoData = data.dataSource === 'demo_seed';
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const searchResults = [
    ...navItems.map((item) => ({ label: item.label, detail: `${item.label} workspace`, nav: item.label })),
    ...metrics.map((metric) => ({ label: metric.label, detail: `${metric.displayValue} · ${metric.comparisonLabel}`, nav: 'Analytics' })),
    ...experiments.map((experiment) => ({ label: experiment.name, detail: `${experiment.focusMetric} · ${experiment.progressPct}% complete`, nav: 'Experiments' })),
    ...decisions.map((decision) => ({ label: decision.title, detail: `${humanise(decision.outcome)} · ${signedPct(decision.impactPct)} impact`, nav: 'Decisions' })),
    { label: bottleneck.stage, detail: `Detected bottleneck · ${humanise(bottleneck.severity)} severity`, nav: 'Intelligence' },
    { label: recommendation.title, detail: `Recommended simulation · ${recommendation.confidencePct}% confidence`, nav: 'Simulations' },
  ].filter((item) => normalizedSearch && `${item.label} ${item.detail}`.toLowerCase().includes(normalizedSearch)).slice(0, 6);

  const askCopilot = async (question: string) => {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || copilotLoading) return;
    setCopilotQuery('');
    setCopilotOpen(true);
    setCopilotLoading(true);
    try {
      const response = await fetch('/api/v1/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...await firebaseAuthorizationHeader() },
        body: JSON.stringify({
          question: cleanQuestion,
          context: {
            workspace: { id: workspace.id, name: workspace.name, objective: workspace.objective, environment: workspace.environment },
            dataSource: data.dataSource,
            dataSourceNote: data.dataSourceNote,
            metrics: metrics.map(({ key, label, displayValue, deltaPct, direction, comparisonLabel, isImprovement }) => ({ key, label, displayValue, deltaPct, direction, comparisonLabel, isImprovement })),
            growth: { metricLabel: growth.metricLabel, currentDisplay: growth.currentDisplay, rangeLabel: growth.rangeLabel },
            bottleneck: { stage: bottleneck.stage, severity: bottleneck.severity, summary: bottleneck.summary, evidenceWindowDays: bottleneck.evidenceWindowDays },
            recommendation: { title: recommendation.title, description: recommendation.description, predictedUpliftPct: recommendation.predictedUpliftPct, confidencePct: recommendation.confidencePct, riskLevel: recommendation.riskLevel, focusMetric: recommendation.focusMetric },
            experiments: experiments.map(({ name, focusMetric, status, progressPct, observedLiftPct, isConclusive }) => ({ name, focusMetric, status, progressPct, observedLiftPct, isConclusive })),
            decisions: decisions.map(({ title, outcome, impactPct, summary }) => ({ title, outcome, impactPct, summary })),
          },
        }),
      });
      const payload = await response.json() as { reply?: string; message?: string };
      if (!response.ok || !payload.reply) throw new Error(payload.message || 'AXIOM AI could not answer right now.');
      setCopilotReply(payload.reply);
    } catch (cause) {
      setCopilotReply(cause instanceof Error ? cause.message : 'AXIOM AI could not answer right now.');
    } finally {
      setCopilotLoading(false);
    }
  };

  const changeWorkspace = async (workspaceId: string) => {
    if (workspaceSwitching || workspaceId === workspace.id) { setTopbarMenu(null); return; }
    setWorkspaceSwitching(true);
    try {
      const updated = await selectWorkspace(workspaceId);
      setData(updated);
      setTopbarMenu(null);
      notify(`${updated.workspace.name} workspace selected`);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'Workspace could not be selected');
    } finally {
      setWorkspaceSwitching(false);
    }
  };

  return (
    <main className={`app-shell theme-${theme}${sidebarCollapsed ? ' sidebar-collapsed' : ''}`} data-theme={theme}>
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Primary navigation">
          {navItems.map(({ icon: Icon, label }) => (
            <button onClick={() => activateSection(label)} aria-current={activeNav === label ? 'page' : undefined} className={activeNav === label ? 'nav-item active' : 'nav-item'} key={label} type="button"><i><Icon strokeWidth={1.8} /></i><span>{label}</span></button>
          ))}
        </nav>
        <FiberWave className="sidebar-wave" />
        <div className="copilot-card"><strong><Sparkles /> AXIOM AI</strong><p>Ask questions or analyze evidence.</p><button onClick={() => setCopilotOpen(true)} type="button" aria-label="Open AXIOM AI"><Sparkles /></button></div>
        <button className="collapse" type="button" aria-pressed={sidebarCollapsed} onClick={toggleSidebar}><span className="collapse-icon"><ArrowLeft /></span><span>{sidebarCollapsed ? 'Expand' : 'Collapse'}</span></button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button id="workspace-button" onClick={() => setTopbarMenu((current) => current === 'workspace' ? null : 'workspace')} className={`workspace-select${spotlight === 'workspace-button' ? ' spotlight' : ''}`} type="button" aria-expanded={topbarMenu === 'workspace'}><Building2 /> {workspace.name} <ChevronDown /></button>
          <div className="search-shell">
            <label className="search"><Search /><input ref={searchRef} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && searchResults[0]) { event.preventDefault(); activateSection(searchResults[0].nav); } }} aria-label="Search" placeholder="Search metrics, experiments, insights..." /><kbd>⌘ K</kbd></label>
            {normalizedSearch && (
              <div className="search-results" role="listbox" aria-label="Search results">
                {searchResults.length > 0 ? searchResults.map((result, index) => (
                  <button key={`${result.nav}-${result.label}-${index}`} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => activateSection(result.nav)}>
                    <span>{result.label}</span><small>{result.detail}</small><ArrowRight />
                  </button>
                )) : <p>No AXIOM results found</p>}
              </div>
            )}
          </div>
          <div className="theme-switcher" role="group" aria-label="Appearance theme">
            <button type="button" className={theme === 'light' ? 'active' : ''} aria-pressed={theme === 'light'} onClick={() => selectTheme('light')} title="Light mode"><Sun /><span>Light</span></button>
            <button type="button" className={theme === 'dark' ? 'active' : ''} aria-pressed={theme === 'dark'} onClick={() => selectTheme('dark')} title="Dark mode"><Moon /><span>Dark</span></button>
            <button type="button" className={theme === 'neon' ? 'active' : ''} aria-pressed={theme === 'neon'} onClick={() => selectTheme('neon')} title="Neon mode"><Sparkles /><span>Neon</span></button>
          </div>
          <button onClick={() => setTopbarMenu((current) => current === 'notifications' ? null : 'notifications')} className="notification" aria-label="Notifications" aria-expanded={topbarMenu === 'notifications'} type="button"><Bell /><b>3</b></button>
          <button id="profile-button" className={`avatar${spotlight === 'profile-button' ? ' spotlight' : ''}`} type="button" aria-label="Profile" aria-expanded={topbarMenu === 'profile'} onClick={() => setTopbarMenu((current) => current === 'profile' ? null : 'profile')}><img src="/brand/profile-axiom-core-256.png" width="49" height="49" alt="" /></button>

          {topbarMenu === 'workspace' && <div className="topbar-popover workspace-popover"><small>{data.workspaceContext ? `${humanise(data.workspaceContext.role)} · ${data.workspaceContext.name}` : 'ACTIVE WORKSPACE'}</small><strong>{workspace.name}</strong><p>{workspace.objective ?? workspace.organizationName}</p><div className="workspace-options" role="list" aria-label="Available workspaces">{availableWorkspaces.map((option) => <button key={option.id} type="button" className={option.id === workspace.id ? 'active' : ''} disabled={workspaceSwitching} onClick={() => changeWorkspace(option.id)}><Building2 /><span><b>{option.name}</b><em>{humanise(option.environment)}</em></span>{option.id === workspace.id ? <CircleCheckBig /> : <ArrowRight />}</button>)}</div><button type="button" onClick={() => { setTopbarMenu(null); notify(data.dataSourceNote); }}><CircleCheckBig /> {systemStatus.message}</button></div>}
          {topbarMenu === 'notifications' && <div className="topbar-popover notifications-popover"><small>3 SYSTEM UPDATES</small><button type="button" onClick={() => { setTopbarMenu(null); notify(data.dataSourceNote); }}><CircleCheckBig /><span><b>{systemStatus.label}</b><em>{systemStatus.message}</em></span></button><button type="button" onClick={() => activateSection('Intelligence')}><CircleAlert /><span><b>{bottleneck.stage}</b><em>{humanise(bottleneck.severity)} severity bottleneck</em></span></button><button type="button" onClick={() => activateSection('Simulations')}><Sparkles /><span><b>New recommendation</b><em>{recommendation.title}</em></span></button></div>}
          {topbarMenu === 'profile' && <div className="topbar-popover profile-popover"><div className="profile-summary"><span><img src="/brand/profile-axiom-core-256.png" width="42" height="42" alt="" /></span><p><strong>{data.session?.displayName ?? data.operatorFirstName}</strong><small>{data.session?.email ?? 'AXIOM operator'}</small></p></div><button type="button" onClick={() => activateSection('Settings')}><Settings /> Workspace settings</button><button type="button" onClick={() => { setTopbarMenu(null); setCopilotOpen(true); }}><Sparkles /> Open AXIOM AI</button><button type="button" onClick={logout}><LogOut /> Log out</button><em>{workspace.name} · {humanise(workspace.environment)} · {data.storage ? `saved r${data.storage.revision}` : 'connected'}</em></div>}
        </header>

        {activeNav === 'Overview' ? <div id="dashboard-overview" tabIndex={-1} className={`dashboard${spotlight === 'dashboard-overview' ? ' spotlight' : ''}`}>
          <div className="ambient-network" aria-hidden="true"><FiberWave className="horizon-wave" /></div>
          <section className="welcome-row">
            <div>
              <h1>{greeting()}, {data.operatorFirstName} <span>👋</span></h1>
              {/*
                Demo data ko demo data batana **mandatory** hai, chhupana nahi.
                PROJECT_CONTEXT ka rule: "No fabricated metrics." Isliye source
                label UI mein visible hai, sirf tooltip mein nahi.
              */}
              <p>AXIOM is monitoring your <b>growth system</b>{isDemoData ? <> · <b>demo seed data</b></> : <> · <b>measured workspace data</b></>}</p>
            </div>
            <button className="live-status" type="button" title={data.dataSourceNote} onClick={() => notify(data.dataSourceNote)}>
              <i /> <b>{systemStatus.label}</b><span>{systemStatus.message}</span>
            </button>
          </section>

          <section className="metric-grid" aria-label="Key metrics">{metrics.map((metric, index) => <MetricCard metric={metric} index={index} key={metric.key} />)}</section>

          <section className="analysis-grid">
            <article id="growth-panel" tabIndex={-1} className={`panel growth-panel${spotlight === 'growth-panel' ? ' spotlight' : ''}`}><header><h2>Growth Overview <Info /></h2><div><button type="button" onClick={() => notify(`${growth.metricLabel} is the active metric`)}>{growth.metricLabel} <ChevronDown /></button><button type="button" onClick={() => notify(`${growth.rangeLabel} evidence window selected`)}>{growth.rangeLabel} <ChevronDown /></button></div></header><GrowthChart growth={growth} /></article>

            <article id="bottleneck-panel" tabIndex={-1} className={`panel bottleneck-panel${spotlight === 'bottleneck-panel' ? ' spotlight' : ''}`}>
              <header><h2><CircleAlert /> <span>Detected Bottleneck</span></h2></header>
              <h3>{bottleneck.stage}</h3>
              <div className="severity">Severity <b>{humanise(bottleneck.severity)}</b></div>
              <p>Evidence-based funnel · {bottleneck.evidenceWindowDays}-day window</p>
              <FunnelBars bottleneck={bottleneck} />
              <button onClick={() => { setCopilotReply(`${bottleneck.stage}: ${bottleneck.summary}`); setCopilotOpen(true); }} className="secondary-action" type="button"><BarChart3 /> View full analysis <ArrowRight /></button>
            </article>

            <article id="recommendation-panel" tabIndex={-1} className={`panel recommendation-panel${spotlight === 'recommendation-panel' ? ' spotlight' : ''}`}>
              <header><h2><Sparkles /> AXIOM Recommendation</h2></header>
              <h3>{recommendation.title}</h3>
              <div className="prediction">
                <div><span>Predicted uplift</span><strong>{signedPct(recommendation.predictedUpliftPct)}</strong><em>{recommendation.focusMetric}</em></div>
                <div><span>Confidence</span><b>{recommendation.confidencePct}%</b><i /></div>
              </div>
              <div className="risk">Risk <b><ShieldCheck /> {humanise(recommendation.riskLevel)}</b></div>
              <button onClick={() => setReviewOpen(true)} className="primary-action" type="button">Review experiment <ArrowRight /></button>
            </article>
          </section>

          <section className="operations-grid">
            <article id="experiments-panel" tabIndex={-1} className={`panel experiments-panel${spotlight === 'experiments-panel' ? ' spotlight' : ''}`}>
              <header><h2><Beaker /> Active Experiments</h2></header><div className="table-head"><span>Experiment</span><span>Focus Metric</span><span>Status</span><span>Progress</span><span>Impact (Lift)</span></div>
              {experiments.map((experiment) => (
                <ExperimentRow
                  key={experiment.id}
                  experiment={experiment}
                  onSelect={() => setSelectedExperiment(experiment)}
                />
              ))}
              <button className="panel-link" type="button" onClick={() => activateSection('Experiments')}>View all experiments <ArrowRight /></button>
            </article>

            <article id="decisions-panel" tabIndex={-1} className={`panel decisions-panel${spotlight === 'decisions-panel' ? ' spotlight' : ''}`}>
              <header><h2><ReceiptText /> Recent Decision Receipts</h2></header>
              <div className="decision-list">
                {decisions.map((decision) => (
                  <DecisionRow key={decision.id} decision={decision} onSelect={() => setSelectedDecision(decision)} />
                ))}
              </div>
              <button className="panel-link" type="button" onClick={() => activateSection('Decisions')}>View all decisions <ArrowRight /></button>
            </article>
          </section>
        </div> : <SectionPages activeNav={activeNav} data={data} theme={theme} onThemeChange={selectTheme} onOpenCopilot={(message) => { setCopilotReply(message); setCopilotOpen(true); }} onReview={() => setReviewOpen(true)} onExperiment={setSelectedExperiment} onDecision={setSelectedDecision} onNotify={notify} />}
      </section>

      {reviewOpen && (
        <ReviewModal
          recommendation={recommendation}
          saving={approvalSaving}
          onClose={() => setReviewOpen(false)}
          onApprove={async () => {
            if (approvalSaving) return;
            setApprovalSaving(true);
            try {
              const updated = await approveRecommendation(recommendation.id);
              setData(updated);
              setReviewOpen(false);
              notify(`Experiment approved and saved for ${recommendation.trafficPct}% canary traffic`);
            } catch (cause) {
              notify(cause instanceof Error ? cause.message : 'Approval could not be saved');
            } finally {
              setApprovalSaving(false);
            }
          }}
        />
      )}

      {selectedExperiment && <ExperimentDetailModal experiment={selectedExperiment} saving={experimentActionSaving} onClose={() => setSelectedExperiment(null)} onControl={async (action) => { if (experimentActionSaving) return; setExperimentActionSaving(true); try { const result = await controlExperiment(workspace.id, selectedExperiment.id, action); const updated = await loadOverview(undefined, workspace.id); setData(updated); setSelectedExperiment(updated.experiments.find((experiment) => experiment.id === selectedExperiment.id) ?? null); notify(`Experiment ${humanise(result.status)}; delivery ${result.flagEnabled ? 'enabled' : 'disabled'}`); } catch (cause) { notify(cause instanceof Error ? cause.message : 'Experiment control failed'); } finally { setExperimentActionSaving(false); } }} onAnalyze={() => { setCopilotReply(`${selectedExperiment.name} is ${selectedExperiment.progressPct}% complete with ${signedPct(selectedExperiment.observedLiftPct)} observed lift. ${selectedExperiment.isConclusive ? 'The result is conclusive.' : 'More evidence is required before a decision.'}`); setSelectedExperiment(null); setCopilotOpen(true); }} />}

      {selectedDecision && <DecisionDetailModal decision={selectedDecision} onClose={() => setSelectedDecision(null)} onAnalyze={() => { setCopilotReply(`${selectedDecision.title}: ${selectedDecision.summary} Measured impact was ${signedPct(selectedDecision.impactPct)}.`); setSelectedDecision(null); setCopilotOpen(true); }} />}

      {copilotOpen && <div className="copilot-backdrop" role="presentation" onMouseDown={() => setCopilotOpen(false)}><aside className="copilot-drawer" aria-label="AXIOM AI" onMouseDown={(event) => event.stopPropagation()}><header><span><i><Sparkles /></i><b>AXIOM AI</b><small>Evidence-aware copilot</small></span><button type="button" aria-label="Close AXIOM AI" onClick={() => setCopilotOpen(false)}><X /></button></header><div className={`copilot-message${copilotLoading ? ' loading' : ''}`}><BrainCircuit /><div><small>{copilotLoading ? 'THINKING WITH WORKSPACE EVIDENCE' : 'AXIOM ANALYSIS'}</small><p>{copilotLoading ? 'Reviewing metrics, experiments, and decision history…' : (copilotReply || `I’m ready. Ask me about ${bottleneck.stage}, your metrics, experiments, or the next best move.`)}</p></div></div><div className="copilot-prompts"><button className="prompt-chip" type="button" disabled={copilotLoading} onClick={() => void askCopilot('Explain the current bottleneck and the evidence behind it.')}>Explain bottleneck</button><button className="prompt-chip" type="button" disabled={copilotLoading} onClick={() => void askCopilot('Review the recommended experiment and explain risks, confidence, and next steps.')}>Review experiment</button><button className="prompt-chip" type="button" disabled={copilotLoading} onClick={() => void askCopilot('Summarize the health of this workspace and identify the top priority.')}>Workspace health</button></div><form onSubmit={(event) => { event.preventDefault(); void askCopilot(copilotQuery); }}><input value={copilotQuery} onChange={(event) => setCopilotQuery(event.target.value)} placeholder="Ask about metrics, risks, or strategy..." aria-label="Ask AXIOM anything" disabled={copilotLoading} /><button type="submit" aria-label="Send question" disabled={copilotLoading || !copilotQuery.trim()}><Send /></button></form><footer><ShieldCheck /> Uses governed workspace evidence · human approval stays required</footer></aside></div>}

      {toast && <div className="toast" role="status"><CircleCheckBig /> {toast}</div>}
    </main>
  );
}
