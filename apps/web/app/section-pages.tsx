'use client';

import { memo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  Activity, ArrowRight, BarChart3, Beaker, BellRing, BrainCircuit, Building2,
  Check, ChevronDown, ChevronRight, CircleCheckBig, CircleX, Database, FlaskConical, Gauge, Info,
  GitBranch, Lock, Moon, Network, Play, Puzzle, ReceiptText, Search, Settings,
  ShieldCheck, Sparkles, Sun, Timer, Webhook,
  type LucideIcon,
} from 'lucide-react';
import type { ActiveExperiment, DashboardResponse, DecisionReceiptSummary } from './lib/axiom-contract';
import { firebaseAuthorizationHeader } from './lib/firebase-client';

type SectionPagesProps = {
  activeNav: string; data: DashboardResponse;
  onOpenCopilot: (message: string) => void; onReview: () => void;
  onExperiment: (experiment: ActiveExperiment) => void;
  onDecision: (decision: DecisionReceiptSummary) => void;
  onNotify: (message: string) => void;
  theme: 'dark' | 'light' | 'neon';
  onThemeChange: (theme: 'dark' | 'light' | 'neon') => void;
};

function humanise(value: string): string {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function signedPct(value: number): string { return value < 0 ? `−${Math.abs(value)}%` : `+${value}%`; }

function makeTelemetryPaths(values: number[], axisMax: number) {
  const denominator = Math.max(values.length - 1, 1);
  const points = values.map((value, index) => ({
    x: (index / denominator) * 100,
    y: 100 - (value / axisMax) * 100,
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  return { points, line, area: `M ${line.replaceAll(',', ' ')} L 100 100 L 0 100 Z` };
}

function CommandHeader({ icon: Icon, eyebrow, title, description, action, status }: { icon: LucideIcon; eyebrow: string; title: string; description: string; action?: ReactNode; status: string }) {
  return <header className="command-header"><div className="command-title-mark"><Icon /></div><div className="command-copy"><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div><div className="command-header-side"><small><i /> {status}</small>{action}</div></header>;
}

function CommandButton({ children, onClick, subtle = false }: { children: ReactNode; onClick: () => void; subtle?: boolean }) {
  return <button className={`command-action${subtle ? ' subtle' : ''}`} type="button" onClick={onClick}>{children}<ArrowRight /></button>;
}

function IntelligencePage({ data, onOpenCopilot, onReview }: Pick<SectionPagesProps, 'data' | 'onOpenCopilot' | 'onReview'>) {
  const { bottleneck, recommendation } = data;
  return <section id="section-intelligence" tabIndex={-1} className="section-page command-page intelligence-command intelligence-v2">
    <CommandHeader icon={BrainCircuit} eyebrow="INTELLIGENCE CENTER" title="From signal to the next best move." description={`A decision-ready view of the strongest constraint across the latest ${bottleneck.evidenceWindowDays} days.`} status={data.measurement?.state === 'measured' ? `${data.measurement.observedUsers} users measured` : 'Demo evidence · collecting'} action={<CommandButton onClick={() => onOpenCopilot(`${bottleneck.stage}: ${bottleneck.summary}`)}><Sparkles /> Ask AXIOM</CommandButton>} />
    <div className="intel-v2-layout">
      <article className="intel-v2-funnel command-surface">
        <div className="surface-kicker"><span><GitBranch /> Conversion journey</span><em>{bottleneck.evidenceWindowDays} DAY EVIDENCE</em></div>
        <div className="intel-v2-summary"><div><span>PRIMARY CONSTRAINT</span><h2>{bottleneck.stage}</h2><p>{bottleneck.summary}</p></div><div className="dropoff-score"><strong>{bottleneck.dropOffPct}%</strong><small>step drop-off</small><em>{humanise(bottleneck.severity)} severity</em></div></div>
        <div className="funnel-v2-list">{bottleneck.steps.map((step, index) => <div key={step.label} className={step.isBottleneck ? 'critical' : ''}><i>{String(index + 1).padStart(2, '0')}</i><span><b>{step.label}</b><small>{step.userCount.toLocaleString('en-IN')} users</small></span><div className="funnel-v2-track"><i style={{ width: `${step.widthPct}%` }} /><b style={{ left: `${Math.max(step.widthPct - 2, 2)}%` }} /></div><strong>{step.conversionPct}%</strong></div>)}</div>
        <div className="opportunity-rank-grid" aria-label="Ranked growth opportunities">{(data.opportunities ?? []).map((candidate) => <button type="button" key={candidate.id} className={candidate.selected ? 'selected' : ''} onClick={() => candidate.selected ? onReview() : onOpenCopilot(`${candidate.title}. Score ${candidate.score}. ${candidate.description}`)}><i>{candidate.rank}</i><span><b>{candidate.title}</b><small>Score {candidate.score} · {candidate.confidencePct}% confidence</small></span><em>{candidate.effort}</em></button>)}</div>
      </article>
      <aside className="intel-v2-brief command-surface">
        <div className="surface-kicker"><span><Sparkles /> Recommended action</span><em>{humanise(recommendation.riskLevel)} RISK</em></div>
        <div className="brief-v2-heading"><span><small>CONFIDENCE</small><strong>{recommendation.confidencePct}%</strong></span><i><b style={{ width: `${recommendation.confidencePct}%` }} /></i></div>
        <h2>{recommendation.title}</h2><p>{recommendation.description}</p>
        <div className="brief-v2-metrics"><span><small>Predicted lift</small><strong>{signedPct(recommendation.predictedUpliftPct)}</strong></span><span><small>Canary traffic</small><b>{recommendation.trafficPct}%</b></span><span><small>Run window</small><b>{recommendation.durationDays} days</b></span></div>
        <div className="brief-v2-evidence"><h3>Evidence behind the move</h3>{recommendation.evidence.map((item) => <p key={item}><Check /> {item}</p>)}</div>
        <div className="brief-v2-guardrail"><ShieldCheck /><span><b>Human approval required</b><small>{recommendation.realityGate.checks.filter((check) => check.passed).length}/{recommendation.realityGate.checks.length} safety checks passed before launch.</small></span></div>
        <CommandButton onClick={onReview}>Review intervention</CommandButton>
      </aside>
    </div>
  </section>;
}

function ExperimentsPage({ data, onExperiment, onReview }: Pick<SectionPagesProps, 'data' | 'onExperiment' | 'onReview'>) {
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState<'all' | 'running' | 'ready'>('all');
  const running = data.experiments.filter((item) => item.status === 'running').length;
  const averageLift = Number((data.experiments.reduce((sum, item) => sum + item.observedLiftPct, 0) / Math.max(data.experiments.length, 1)).toFixed(1));
  const filteredExperiments = data.experiments.filter((experiment) => `${experiment.name} ${experiment.focusMetric}`.toLowerCase().includes(query.trim().toLowerCase()) && (filter === 'all' || (filter === 'running' && experiment.status === 'running') || (filter === 'ready' && experiment.isConclusive)));
  return <section id="section-experiments" tabIndex={-1} className="section-page command-page experiments-command">
    <CommandHeader icon={FlaskConical} eyebrow="EXPERIMENT MISSION CONTROL" title="Ship evidence. Not opinions." description="Each test is a live mission with traffic, progress and decision readiness in one view." status={`${running} missions running`} action={<CommandButton onClick={onReview}><Play /> Review next</CommandButton>} />
    <div className="mission-toolbar"><div className="mission-score"><span><small>LIVE</small><strong>{running}</strong></span><span><small>PORTFOLIO LIFT</small><strong>{signedPct(averageLift)}</strong></span><span><small>READY</small><strong>{data.experiments.filter((item) => item.isConclusive).length}</strong></span></div><label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a mission..." /></label><div className="mission-filters">{(['all', 'running', 'ready'] as const).map((value) => <button type="button" key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{humanise(value)}</button>)}</div></div>
    <div className="mission-board">{filteredExperiments.map((experiment, index) => <button type="button" className="mission-card command-surface" key={experiment.id} onClick={() => onExperiment(experiment)}><header><span>MISSION {String(index + 1).padStart(2, '0')}</span><em className={experiment.isConclusive ? 'ready' : ''}><i /> {experiment.isConclusive ? 'Decision-ready' : humanise(experiment.status)}</em></header><div className="mission-card-title"><i><Beaker /></i><div><h2>{experiment.name}</h2><p>{experiment.focusMetric}</p></div></div><div className="mission-progress"><span><small>Evidence progress</small><b>{experiment.progressPct}%</b></span><i><b style={{ width: `${experiment.progressPct}%` }} /></i></div><div className="mission-data"><span><small>TRAFFIC</small><b>{experiment.trafficPct}%</b></span><span><small>OBSERVED LIFT</small><strong>{signedPct(experiment.observedLiftPct)}</strong></span></div><footer><span>Open evidence room</span><ChevronRight /></footer></button>)}{filteredExperiments.length === 0 && <div className="command-empty">No missions match this view.</div>}</div>
  </section>;
}

function AnalyticsPage({ data }: Pick<SectionPagesProps, 'data'>) {
  const { metrics, growth } = data;
  const measurement = data.measurement;
  const telemetry = makeTelemetryPaths(growth.points.map((point) => point.value), growth.axisMax);
  const retentionText = measurement?.state === 'measured'
    ? `D7 retention ${measurement.retention.day7Pct ?? '—'}% · D30 retention ${measurement.retention.day30Pct ?? '—'}%.`
    : `${measurement?.observedUsers ?? 0}/${measurement?.requiredUsers ?? 10} users observed; AXIOM is still collecting governed evidence.`;
  return <section id="section-analytics" tabIndex={-1} className="section-page command-page analytics-command">
    <CommandHeader icon={BarChart3} eyebrow="ANALYTICS / SYSTEM PULSE" title="Growth, decoded in real time." description={`${growth.metricLabel} trajectory and leading indicators across the ${growth.rangeLabel} operating window.`} status={measurement?.state === 'measured' ? 'Measured telemetry' : 'Demo telemetry · collecting'} />
    <div className="telemetry-layout"><article className="telemetry-canvas command-surface"><div className="surface-kicker telemetry-kicker"><span><Activity /> Growth Overview <Info /></span><div className="telemetry-controls"><span>{growth.metricLabel} <ChevronDown /></span><span>{growth.rangeLabel} <ChevronDown /></span></div></div><div className="telemetry-value"><span><small>CURRENT VALUE</small><strong>{growth.currentDisplay}</strong></span><b>{measurement?.state === 'measured' ? 'Measured trend' : 'Demo trajectory'}</b></div><div className="telemetry-plot"><div className="telemetry-axis">{growth.axisLabels.map((label) => <span key={label}>{label}</span>)}</div><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={`${growth.metricLabel} trend`} role="img"><defs><linearGradient id="telemetry-area-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#30ddff" stopOpacity="0.16" /><stop offset="72%" stopColor="#1b8cff" stopOpacity="0.045" /><stop offset="100%" stopColor="#1b8cff" stopOpacity="0" /></linearGradient></defs><path className="telemetry-area" d={telemetry.area} /><polyline className="telemetry-line" points={telemetry.line} vectorEffect="non-scaling-stroke" /></svg><div className="telemetry-stems" aria-hidden="true">{telemetry.points.map((point, index) => <i key={growth.points[index].occurredOn} style={{ left: `${point.x}%`, top: `${point.y}%`, height: `${100 - point.y}%` } as CSSProperties} />)}</div><div className="telemetry-points" aria-hidden="true">{telemetry.points.map((point, index) => <i key={growth.points[index].occurredOn} style={{ left: `${point.x}%`, top: `${point.y}%` } as CSSProperties} />)}</div><div className="telemetry-signals" aria-hidden="true">{telemetry.points.map((point, index) => <i key={`${growth.points[index].occurredOn}-signal`} style={{ left: `${Math.min(point.x + (index % 2 ? 1.4 : -1.4), 98)}%`, top: `${Math.min(point.y + 12 + ((index * 7) % 18), 94)}%` } as CSSProperties} />)}</div></div><div className="telemetry-dates">{growth.xAxisLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div></article><aside className="metric-radar command-surface"><div className="surface-kicker"><span><Gauge /> Metric radar</span><em>GOVERNED WINDOW</em></div>{metrics.map((metric, index) => <div className={`radar-metric ${metric.isImprovement ? 'good' : 'bad'}`} key={metric.key}><i>{String(index + 1).padStart(2, '0')}</i><span><small>{metric.label}</small><strong>{metric.displayValue}</strong></span><b>{metric.direction === 'up' ? '↑' : metric.direction === 'down' ? '↓' : '→'} {Math.abs(metric.deltaPct)}%</b></div>)}<div className="radar-note"><Sparkles /><span><b>{measurement?.state === 'measured' ? 'Cohort evidence' : 'Evidence gate'}</b><small>{retentionText}</small></span></div></aside></div>
  </section>;
}

function SimulationsPage({ data, onReview }: Pick<SectionPagesProps, 'data' | 'onReview'>) {
  const { recommendation } = data;
  const [scenario, setScenario] = useState<'conservative' | 'base' | 'aggressive'>('base');
  const [simulation, setSimulation] = useState<{ medianLiftPct: number; interval90Pct: [number, number]; probabilityPositivePct: number; probabilityGuardrailBreachPct: number; riskBand: string; recommendation: string } | null>(null);
  const [simulationError, setSimulationError] = useState('');
  const [running, setRunning] = useState(false);
  const runSimulation = async () => {
    setRunning(true); setSimulationError('');
    try {
      const first = data.bottleneck.steps[0]?.userCount ?? 1000; const activated = data.bottleneck.steps.find((step) => step.label.toLowerCase().includes('activated'));
      const response = await fetch('/api/v1/simulations', { method: 'POST', headers: { 'Content-Type': 'application/json', ...await firebaseAuthorizationHeader() }, body: JSON.stringify({
        workspaceId: data.workspace.id, recommendationId: recommendation.id, baseConversionPct: activated?.conversionPct ?? 12.9,
        predictedUpliftPct: recommendation.predictedUpliftPct, trafficPct: recommendation.trafficPct, durationDays: recommendation.durationDays,
        dailyEligibleUsers: Math.max(1, Math.round(first / Math.max(data.bottleneck.evidenceWindowDays, 1))), baselineGuardrailPct: data.metrics.find((metric) => metric.key === 'churn_rate')?.rawValue ?? 3.2,
        scenario, iterations: 3000,
      }) });
      const body = await response.json() as { result?: typeof simulation; message?: string };
      if (!response.ok || !body.result) throw new Error(body.message ?? 'Simulation failed'); setSimulation(body.result);
    } catch (error) { setSimulation(null); setSimulationError(error instanceof Error ? error.message : 'Simulation could not run.'); } finally { setRunning(false); }
  };
  return <section id="section-simulations" tabIndex={-1} className="section-page command-page simulations-command">
    <CommandHeader icon={Network} eyebrow="SIMULATION / DIGITAL TWIN" title="Preview the future before launch." description="Stress-test the recommended intervention against assumptions and safety gates." status={simulation ? `${humanise(simulation.riskBand)} simulated risk` : 'Model synchronized'} action={<CommandButton onClick={onReview}><Play /> Open review</CommandButton>} />
    <div className="simulation-switch" aria-label="Simulation scenario">{(['conservative', 'base', 'aggressive'] as const).map((value) => <button type="button" className={scenario === value ? 'active' : ''} key={value} onClick={() => { setScenario(value); setSimulation(null); setSimulationError(''); }}>{humanise(value)}</button>)}{simulationError && <span role="alert">{simulationError}</span>}<button type="button" className="run" disabled={running} onClick={runSimulation}><Play /> {running ? 'Running 3,000 worlds…' : 'Run shadow simulation'}</button></div>
    <div className="twin-console"><article className="twin-stage command-surface"><div className="twin-visual"><i /><i /><i /><span><Sparkles /><strong>{signedPct(simulation?.medianLiftPct ?? recommendation.predictedUpliftPct)}</strong><small>{simulation ? 'simulated median lift' : 'predicted lift'}</small></span></div><div className="twin-copy"><span>ACTIVE SCENARIO · {scenario.toUpperCase()}</span><h2>{recommendation.title}</h2><p>{recommendation.description}</p><div>{[['Traffic', `${recommendation.trafficPct}%`], ['Duration', `${recommendation.durationDays} days`], ['Positive chance', simulation ? `${simulation.probabilityPositivePct}%` : `${recommendation.confidencePct}%`], ['90% range', simulation ? `${simulation.interval90Pct[0]}% to ${simulation.interval90Pct[1]}%` : humanise(recommendation.riskLevel)]].map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div></div></article><aside className="gate-console command-surface"><div className="surface-kicker"><span><ShieldCheck /> Reality gate</span><em className={simulation?.recommendation === 'do_not_launch' || !recommendation.realityGate.passed ? 'failed' : 'passed'}>{simulation ? humanise(simulation.recommendation) : recommendation.realityGate.passed ? 'PASSED' : 'BLOCKED'}</em></div>{simulation && <div className="simulation-result"><span><small>POSITIVE OUTCOME</small><b>{simulation.probabilityPositivePct}%</b></span><span><small>GUARDRAIL RISK</small><b>{simulation.probabilityGuardrailBreachPct}%</b></span></div>}<div className="gate-matrix">{recommendation.realityGate.checks.map((check) => <div className={check.passed ? 'passed' : 'failed'} key={check.label}>{check.passed ? <CircleCheckBig /> : <CircleX />}<span><b>{check.label}</b><small>{check.detail}</small></span></div>)}</div><div className="assumption-stack"><span>MODEL ASSUMPTIONS</span>{recommendation.assumptions.map((item, index) => <p key={item}><i>{index + 1}</i>{item}</p>)}</div></aside></div>
  </section>;
}

function DecisionsPage({ data, onDecision }: Pick<SectionPagesProps, 'data' | 'onDecision'>) {
  const [filter, setFilter] = useState<'all' | 'verified' | 'monitoring' | 'rolled_back'>('all');
  const counts = { verified: data.decisions.filter((item) => item.outcome === 'verified').length, monitoring: data.decisions.filter((item) => item.outcome === 'monitoring').length, rolled_back: data.decisions.filter((item) => item.outcome === 'rolled_back').length };
  const filteredDecisions = data.decisions.filter((decision) => filter === 'all' || decision.outcome === filter);
  return <section id="section-decisions" tabIndex={-1} className="section-page command-page decisions-command decisions-v2">
    <CommandHeader icon={ReceiptText} eyebrow="DECISION LEDGER" title="A memory your team can trust." description="Every move, reason and measured result is preserved as an auditable receipt." status={`${data.decisions.length} receipts indexed`} />
    <div className="decision-v2-content">
      <div className="outcome-strip command-surface"><div className="outcome-strip-label"><Database /><span><b>Outcome index</b><small>Filter the decision memory</small></span></div>{(['all', 'verified', 'monitoring', 'rolled_back'] as const).map((value) => <button type="button" key={value} className={`${value}${filter === value ? ' active' : ''}`} onClick={() => setFilter(value)}><i>{value === 'verified' ? <CircleCheckBig /> : value === 'monitoring' ? <Timer /> : value === 'rolled_back' ? <CircleX /> : <ReceiptText />}</i><span><b>{humanise(value)}</b><small>{value === 'all' ? data.decisions.length : counts[value]} receipts</small></span></button>)}</div>
      <article className="receipt-stream receipt-stream-v2 command-surface"><div className="surface-kicker"><span><GitBranch /> Decision receipts</span><em>{humanise(filter)} VIEW</em></div><div className="receipt-list">{filteredDecisions.map((decision, index) => <button key={decision.id} type="button" className={decision.outcome} onClick={() => onDecision(decision)}><div className="receipt-marker"><span>{String(index + 1).padStart(2, '0')}</span><i /></div><div className="receipt-copy"><small>{decision.decidedAtDisplay}</small><b>{decision.title}</b><p>{decision.summary}</p></div><em>{humanise(decision.outcome)}</em><strong>{signedPct(decision.impactPct)}</strong><ArrowRight /></button>)}{filteredDecisions.length === 0 && <div className="command-empty">No receipts match this outcome.</div>}</div><footer className="decision-proof-v2"><ShieldCheck /><span><b>Immutable decision trail</b><small>Evidence, approval and measured impact stay attached to every receipt.</small></span><em>Audit ready</em></footer></article>
    </div>
  </section>;
}

function IntegrationsPage({ data, onNotify }: Pick<SectionPagesProps, 'data' | 'onNotify'>) {
  const [connectOpen, setConnectOpen] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const planned = [{ name: 'Stripe', detail: 'Revenue stream', icon: Database }, { name: 'PostHog', detail: 'Product events', icon: Activity }, { name: 'GA4', detail: 'Acquisition data', icon: BarChart3 }, { name: 'Webhooks', detail: 'Custom pipelines', icon: Webhook }];
  const ingestion = data.ingestion ?? { totalEvents: 0, uniqueUsers: 0, lastEventAt: null, sources: [] };
  const connectedSources = ingestion.sources.filter((source) => source.status === 'connected');
  const coverage = Math.round((connectedSources.length / (planned.length + 1)) * 100);
  const eventLabel = `${ingestion.totalEvents.toLocaleString('en-IN')} ${ingestion.totalEvents === 1 ? 'event' : 'events'}`;
  const lastDelivery = ingestion.lastEventAt
    ? new Date(ingestion.lastEventAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'Waiting';
  async function importCsv(file: File) {
    setImportStatus('Reading your file…');
    const rows = (await file.text()).trim().split(/\r?\n/).filter(Boolean).map((row) => row.split(',').map((cell) => cell.trim().replace(/^"|"$/g, '')));
    const headers = (rows.shift() ?? []).map((header) => header.toLowerCase());
    const index = (name: string) => headers.indexOf(name);
    const events = rows.slice(0, 100).map((row, rowIndex) => {
      const eventName = row[index('event_name')] || row[index('event')] || 'user_signed_up';
      const eventType = row[index('event_type')] || (eventName.includes('subscription') || eventName.includes('revenue') ? 'revenue' : 'lifecycle');
      const anonymousId = row[index('anonymous_id')] || row[index('user_id')] || `csv-user-${rowIndex + 1}`;
      const amount = row[index('monthly_amount_inr')] || row[index('amount_inr')];
      return { idempotencyKey: `csv-${Date.now()}-${rowIndex}`, eventType, eventName, anonymousId, occurredAt: row[index('occurred_at')] || new Date().toISOString(), properties: amount ? { monthlyAmountInr: Number(amount) } : {} };
    });
    if (!events.length) { setImportStatus('CSV mein kam se kam ek data row honi chahiye.'); return; }
    try {
      const auth = await firebaseAuthorizationHeader();
      const response = await fetch('/api/v1/events', { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify({ workspaceId: data.workspace.id, source: 'axiom_sdk', events }) });
      if (!response.ok) throw new Error('Import failed');
      setImportStatus(`${events.length} rows imported successfully. Dashboard refresh ho raha hai…`);
      window.setTimeout(() => window.location.reload(), 900);
    } catch { setImportStatus('Import nahi ho paya. CSV columns aur login check karein.'); }
  }
  return <section id="section-integrations" tabIndex={-1} className="section-page command-page integrations-command integrations-v2">
    <CommandHeader icon={Puzzle} eyebrow="INTEGRATION CONTROL CENTER" title="Your entire data system, connected." description="Operate product, revenue and acquisition sources from one secure evidence layer." status={`${eventLabel} ingested`} action={<CommandButton onClick={() => setConnectOpen(true)}><Puzzle /> Connect source</CommandButton>} />
    <div className="integration-v2-layout">
      <article className="integration-v2-main command-surface">
        <div className="surface-kicker"><span><Network /> Data operations</span><em>LIVE WORKSPACE</em></div>
        <div className="integration-v2-kpis"><span><small>Live events</small><strong>{ingestion.totalEvents.toLocaleString('en-IN')}</strong><em>Workspace scoped</em></span><span><small>Known users</small><strong>{ingestion.uniqueUsers.toLocaleString('en-IN')}</strong><em>Anonymous IDs</em></span><span><small>Active sources</small><strong>{connectedSources.length}</strong><em>{connectedSources.length ? 'Receiving data' : 'Endpoint ready'}</em></span><span><small>Last delivery</small><strong className="delivery-time">{lastDelivery}</strong><em>Persistent event log</em></span></div>
        <div className="pipeline-v2"><div className="pipeline-core"><i><Database /></i><span><small>INGESTION CORE</small><b>AXIOM Events API</b><em><i /> {ingestion.totalEvents ? 'Connected and receiving events' : 'Ready at /api/v1/events'}</em></span></div><ArrowRight /> <div className="pipeline-output"><Sparkles /><span><small>GOVERNED OUTPUT</small><b>{ingestion.totalEvents ? 'Evidence stream active' : 'Awaiting first measured event'}</b></span></div></div>
        <div className="source-grid-v2">{planned.map(({ name, detail, icon: Icon }, index) => {const adapterReady=['Stripe','PostHog','Webhooks'].includes(name);const live=connectedSources.some((source)=>source.source.toLowerCase()===name.toLowerCase());return <button type="button" key={name} onClick={() => adapterReady ? setConnectOpen(true) : onNotify(`${name} connector jaldi available hoga.`)}><i><Icon /></i><span><b>{name}</b><small>{detail}</small></span><em>0{index + 1}</em><strong>{live?'Live':adapterReady?'Ready':'Planned'}</strong><ArrowRight /></button>})}</div>
      </article>
      <aside className="integration-v2-side command-surface">
        <div className="surface-kicker"><span><Activity /> Source readiness</span><em>{connectedSources.length ? 'LIVE' : 'ENDPOINT READY'}</em></div>
        <div className="readiness-score"><span><small>CONNECTION COVERAGE</small><strong>{coverage}%</strong><p>{connectedSources.length ? `${connectedSources.length} source is sending measured events into this workspace.` : 'The secure endpoint is ready. No measured source event has been received yet.'}</p></span><div><i style={{ width: `${coverage}%` }} /></div></div>
        <div className="readiness-list"><div className={connectedSources.length ? 'connected' : ''}><i><Database /></i><span><b>AXIOM SDK</b><small>{ingestion.totalEvents ? `${eventLabel} accepted` : 'POST endpoint ready'}</small></span><em>{connectedSources.length ? 'Live' : 'Ready'}</em></div>{planned.slice(0, 3).map(({ name, icon: Icon }) => {const adapterReady=['Stripe','PostHog'].includes(name);const live=connectedSources.some((source)=>source.source.toLowerCase()===name.toLowerCase());return <div className={live?'connected':''} key={name}><i><Icon /></i><span><b>{name}</b><small>{adapterReady?'Governed schema adapter ready':'Schema mapping pending'}</small></span><em>{live?'Live':adapterReady?'Ready':'Planned'}</em></div>})}</div>
        <div className="security-grid-v2"><span><Lock /><b>Encryption</b><small>At rest + transit</small></span><span><ShieldCheck /><b>Workspace scope</b><small>Isolated credentials</small></span><span><ReceiptText /><b>Audit trail</b><small>Every sync recorded</small></span><span><CircleCheckBig /><b>Data honesty</b><small>{data.dataSource === 'demo_seed' ? 'Demo source labelled' : 'Measured source active'}</small></span></div>
        <p className="integration-v2-note">PostHog and Stripe deliveries are normalized into the same governed event taxonomy. Metrics switch from demo to measured only after the evidence gate passes.</p>
      </aside>
    </div>
    {connectOpen && <div className="integration-modal-backdrop" role="presentation" onClick={() => setConnectOpen(false)}><div className="integration-connect-modal" role="dialog" aria-modal="true" aria-labelledby="connect-source-title" onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setConnectOpen(false)} aria-label="Close">×</button><span className="modal-eyebrow">DATA IMPORT</span><h2 id="connect-source-title">Company data connect karein</h2><p>Developer access ke bina CSV upload karke dashboard test karein.</p><label className="csv-upload"><strong>Upload CSV</strong><small>event_name,event_type,user_id,occurred_at,monthly_amount_inr</small><input type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCsv(file); }} /></label><div className="integration-template"><b>Required columns</b><span>event_name · user_id · occurred_at</span><small>Revenue events ke liye monthly_amount_inr bhi add karein.</small></div>{importStatus && <div className="integration-import-status">{importStatus}</div>}<button type="button" className="command-action" onClick={() => setConnectOpen(false)}>Done</button></div></div>}
  </section>;
}

function SettingsPage({ data, onNotify, theme, onThemeChange }: Pick<SectionPagesProps, 'data' | 'onNotify' | 'theme' | 'onThemeChange'>) {
  const { workspace } = data; const settings = ['Bottleneck alerts', 'Experiment updates', 'Decision receipts', 'System health notices'];
  const themeOptions = [{ id: 'light' as const, label: 'Light', detail: 'Bright and clear', icon: Sun }, { id: 'dark' as const, label: 'Dark', detail: 'Focused and calm', icon: Moon }, { id: 'neon' as const, label: 'Neon', detail: 'Maximum AXIOM energy', icon: Sparkles }];
  return <section id="section-settings" tabIndex={-1} className="section-page command-page settings-command settings-v2">
    <CommandHeader icon={Settings} eyebrow="WORKSPACE CONTROL CENTER" title="Identity, signals and appearance." description="Everything that controls how AXIOM looks, communicates and protects live decisions." status={data.storage ? `Saved · revision ${data.storage.revision}` : 'Local configuration'} />
    <div className="settings-v2-content">
      <article className="identity-v2 command-surface"><div className="surface-kicker"><span><Building2 /> Workspace identity</span><em>{humanise(workspace.environment)}</em></div><div className="identity-v2-body"><div className="identity-v2-brand"><span>{workspace.name.charAt(0)}</span><div><small>ACTIVE WORKSPACE</small><h2>{workspace.name}</h2><p>{workspace.objective ?? 'Growth optimization'}</p></div></div><dl><div><dt>Signed-in account</dt><dd>{data.session?.email ?? 'Local development'}</dd></div><div><dt>Workspace ID</dt><dd>{workspace.id}</dd></div><div><dt>Environment</dt><dd>{humanise(workspace.environment)}</dd></div></dl><div className="identity-v2-security"><i><b /> ONLINE</i><Lock /><span><b>Session protected</b><small>Identity and workspace context are isolated and scoped.</small></span></div></div></article>
      <div className="settings-v2-grid">
        <article className="preferences-v2 command-surface"><div className="surface-kicker"><span><BellRing /> Signal preferences</span><em>THIS DEVICE</em></div><div className="preferences-v2-list">{settings.map((label, index) => <label key={label}><i>{index + 1}</i><span><b>{label}</b><small>{index === 0 ? 'High-severity constraints' : index === 1 ? 'Live test and evidence changes' : index === 2 ? 'New verified outcomes' : 'API and workspace status'}</small></span><input type="checkbox" defaultChecked onChange={(event) => onNotify(`${label} ${event.target.checked ? 'enabled' : 'disabled'} for this device`)} /><em /></label>)}</div></article>
        <article className="appearance-v2 command-surface"><div className="surface-kicker"><span><Sparkles /> Appearance</span><em>LIVE PREVIEW</em></div><div className="appearance-options-v2">{themeOptions.map(({ id, label, detail, icon: Icon }) => <button type="button" key={id} className={`${id}${theme === id ? ' active' : ''}`} onClick={() => onThemeChange(id)}><i><Icon /></i><span><b>{label}</b><small>{detail}</small></span>{theme === id && <CircleCheckBig />}</button>)}</div><div className="appearance-note-v2"><Sparkles /><span><b>Theme follows you</b><small>Your selection is saved on this device and applies to every AXIOM page.</small></span></div></article>
      </div>
      <div className="governance-v2"><ShieldCheck /><span><b>Human approval + automatic safety rollback</b><small>{data.riskPolicy ? `Maximum ${data.riskPolicy.maxTrafficPct}% traffic · ${data.riskPolicy.minSubjectsPerVariant} subjects/variant · ${data.riskPolicy.confidenceThresholdPct}% decision threshold · guardrail +${data.riskPolicy.maxGuardrailIncreasePct}% max.` : 'AXIOM V1 cannot launch a live experiment without explicit approval from an operator.'}</small></span><strong>{data.riskPolicy?.autoRollback ? 'AUTO-PROTECTED' : 'PROTECTED'}</strong></div>
    </div>
  </section>;
}

export const SectionPages = memo(function SectionPages(props: SectionPagesProps) {
  switch (props.activeNav) {
    case 'Intelligence': return <IntelligencePage data={props.data} onOpenCopilot={props.onOpenCopilot} onReview={props.onReview} />;
    case 'Experiments': return <ExperimentsPage data={props.data} onExperiment={props.onExperiment} onReview={props.onReview} />;
    case 'Analytics': return <AnalyticsPage data={props.data} />;
    case 'Simulations': return <SimulationsPage data={props.data} onReview={props.onReview} />;
    case 'Decisions': return <DecisionsPage data={props.data} onDecision={props.onDecision} />;
    case 'Integrations': return <IntegrationsPage data={props.data} onNotify={props.onNotify} />;
    case 'Settings': return <SettingsPage data={props.data} onNotify={props.onNotify} theme={props.theme} onThemeChange={props.onThemeChange} />;
    default: return null;
  }
});
