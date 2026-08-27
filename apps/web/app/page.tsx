'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Activity, ArrowLeft, ArrowRight, BarChart3, Beaker, Bell, BrainCircuit,
  Building2, ChevronDown, CircleAlert, CircleCheckBig, CircleX, FlaskConical,
  Funnel, Home as HomeIcon, IndianRupee, Info, Network, Puzzle, ReceiptText,
  Search, Send, Settings, ShieldCheck, Sparkles, Timer, Users, X, Zap,
  type LucideIcon,
} from 'lucide-react';

import { AxiomApiError, AxiomNetworkError, loadOverview } from './lib/axiom-api';
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
      <span>A</span><b className="brand-x" aria-hidden="true"><i /><i /></b><span>IOM</span><em>V1</em>
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

function ReviewModal({
  recommendation,
  onClose,
  onApprove,
}: {
  recommendation: Recommendation;
  onClose: () => void;
  onApprove: () => void;
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
          <button type="button" onClick={onApprove}><Zap /> Approve canary</button>
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
  const [reviewOpen, setReviewOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === 'Escape') { setReviewOpen(false); setCopilotOpen(false); }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);

  useEffect(() => {
    // `cancelled` flag isliye: component unmount hone ke baad `setState` call
    // karna React warning deta hai aur memory leak ka signal hai. React ke
    // StrictMode dev double-mount mein bhi yeh pehli fetch ko ignore kara deta.
    let cancelled = false;

    loadOverview('sudesh@acmecloud.example')
      .then((payload) => { if (!cancelled) { setData(payload); setError(null); } })
      .catch((cause: unknown) => {
        if (cancelled) return;
        if (cause instanceof AxiomNetworkError) {
          setError('AXIOM API se connect nahi ho paya');
          setHint('cd apps/api\nuvicorn app.main:app --reload --port 8000');
        } else if (cause instanceof AxiomApiError) {
          setError(`API error ${cause.status}: ${cause.message}`);
          setHint(null);
        } else {
          setError(cause instanceof Error ? cause.message : 'Unknown error');
          setHint('cd apps/api\npython -m scripts.seed');
        }
      });

    return () => { cancelled = true; };
  }, []);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2200);
  }, []);

  if (error) {
    return <StatusShell title="Dashboard unavailable" message={error} hint={hint ?? undefined} />;
  }
  if (!data) {
    return <StatusShell title="Loading AXIOM…" message="Fetching your growth system snapshot" />;
  }

  const { workspace, systemStatus, metrics, growth, bottleneck, recommendation, experiments, decisions } = data;
  const isDemoData = data.dataSource === 'demo_seed';

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Primary navigation">
          {navItems.map(({ icon: Icon, label }) => (
            <button onClick={() => { setActiveNav(label); notify(`${label} workspace selected`); }} className={activeNav === label ? 'nav-item active' : 'nav-item'} key={label} type="button"><i><Icon strokeWidth={1.8} /></i><span>{label}</span></button>
          ))}
        </nav>
        <FiberWave className="sidebar-wave" />
        <div className="copilot-card"><strong><Sparkles /> AXIOM AI</strong><p>Ask a question or run an analysis...</p><button onClick={() => setCopilotOpen(true)} type="button" aria-label="Open AXIOM AI"><ArrowRight /></button></div>
        <button className="collapse" type="button"><span className="collapse-icon"><ArrowLeft /></span><span>Collapse</span></button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button onClick={() => notify(`${workspace.organizationName} · ${workspace.environment}`)} className="workspace-select" type="button"><Building2 /> {workspace.name} <ChevronDown /></button>
          <label className="search"><Search /><input ref={searchRef} aria-label="Search" placeholder="Search metrics, experiments, insights..." /><kbd>⌘ K</kbd></label>
          <button onClick={() => notify('You have 3 new system updates')} className="notification" aria-label="Notifications" type="button"><Bell /><b>3</b></button>
          <button className="avatar" type="button" aria-label="Profile">{data.operatorFirstName.charAt(0).toUpperCase()}</button><ChevronDown className="profile-chevron" />
        </header>

        <div className="dashboard">
          <div className="ambient-network" aria-hidden="true"><FiberWave className="horizon-wave" /></div>
          <section className="welcome-row">
            <div>
              <h1>{greeting()}, {data.operatorFirstName} <span>👋</span></h1>
              {/*
                Demo data ko demo data batana **mandatory** hai, chhupana nahi.
                PROJECT_CONTEXT ka rule: "No fabricated metrics." Isliye source
                label UI mein visible hai, sirf tooltip mein nahi.
              */}
              <p>AXIOM is monitoring your <b>growth system</b>{isDemoData && <> · <b>demo seed data</b></>}</p>
            </div>
            <button className="live-status" type="button" title={data.dataSourceNote} onClick={() => notify(data.dataSourceNote)}>
              <i /> <b>{systemStatus.label}</b><span>{systemStatus.message}</span><ChevronDown />
            </button>
          </section>

          <section className="metric-grid" aria-label="Key metrics">{metrics.map((metric, index) => <MetricCard metric={metric} index={index} key={metric.key} />)}</section>

          <section className="analysis-grid">
            <article className="panel growth-panel"><header><h2>Growth Overview <Info /></h2><div><button type="button">{growth.metricLabel} <ChevronDown /></button><button type="button">{growth.rangeLabel} <ChevronDown /></button></div></header><GrowthChart growth={growth} /></article>

            <article className="panel bottleneck-panel">
              <header><h2><CircleAlert /> <span>Detected Bottleneck</span></h2></header>
              <h3>{bottleneck.stage}</h3>
              <div className="severity">Severity <b>{humanise(bottleneck.severity)}</b></div>
              <p>Evidence-based funnel · {bottleneck.evidenceWindowDays}-day window</p>
              <FunnelBars bottleneck={bottleneck} />
              <button onClick={() => notify(bottleneck.summary)} className="secondary-action" type="button"><BarChart3 /> View full analysis <ArrowRight /></button>
            </article>

            <article className="panel recommendation-panel">
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
            <article className="panel experiments-panel">
              <header><h2><Beaker /> Active Experiments</h2></header><div className="table-head"><span>Experiment</span><span>Focus Metric</span><span>Status</span><span>Progress</span><span>Impact (Lift)</span></div>
              {experiments.map((experiment) => (
                <ExperimentRow
                  key={experiment.id}
                  experiment={experiment}
                  onSelect={() => notify(
                    experiment.isConclusive
                      ? `${experiment.name} — result conclusive`
                      : `${experiment.name} — ${experiment.progressPct}% complete, not yet conclusive`,
                  )}
                />
              ))}
              <button className="panel-link" type="button" onClick={() => { setActiveNav('Experiments'); notify('All experiments opened'); }}>View all experiments <ArrowRight /></button>
            </article>

            <article className="panel decisions-panel">
              <header><h2><ReceiptText /> Recent Decision Receipts</h2></header>
              <div className="decision-list">
                {decisions.map((decision) => (
                  <DecisionRow key={decision.id} decision={decision} onSelect={() => notify(decision.summary)} />
                ))}
              </div>
              <button className="panel-link" type="button" onClick={() => { setActiveNav('Decisions'); notify('All decision receipts opened'); }}>View all decisions <ArrowRight /></button>
            </article>
          </section>
        </div>
      </section>

      {reviewOpen && (
        <ReviewModal
          recommendation={recommendation}
          onClose={() => setReviewOpen(false)}
          onApprove={() => {
            setReviewOpen(false);
            notify(`Experiment approved for ${recommendation.trafficPct}% canary traffic`);
          }}
        />
      )}

      {copilotOpen && <aside className="copilot-drawer" aria-label="AXIOM AI"><header><span><Sparkles /> AXIOM AI</span><button type="button" aria-label="Close AXIOM AI" onClick={() => setCopilotOpen(false)}><X /></button></header><div className="copilot-message"><BrainCircuit /><p>{bottleneck.summary}</p></div><button className="prompt-chip" type="button" onClick={() => notify(recommendation.evidence[0] ?? 'Analysis started')}>Explain the bottleneck</button><button className="prompt-chip" type="button" onClick={() => setReviewOpen(true)}>Review recommended experiment</button><label><input placeholder="Ask AXIOM anything..." /><button type="button" aria-label="Send question"><Send /></button></label></aside>}

      {toast && <div className="toast" role="status"><CircleCheckBig /> {toast}</div>}
    </main>
  );
}
