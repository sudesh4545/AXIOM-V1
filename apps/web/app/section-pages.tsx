'use client';

import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  Activity, ArrowRight, BarChart3, Beaker, BellRing, BrainCircuit, Building2,
  Check, CircleAlert, CircleCheckBig, CircleX, Database, FlaskConical, Gauge,
  GitBranch, Lock, Network, Play, Puzzle, ReceiptText, Search, Settings, ShieldCheck,
  Sparkles, Timer, TrendingUp, Webhook,
  type LucideIcon,
} from 'lucide-react';

import type { ActiveExperiment, DashboardResponse, DecisionReceiptSummary } from './lib/axiom-contract';

type SectionPagesProps = {
  activeNav: string;
  data: DashboardResponse;
  onOpenCopilot: (message: string) => void;
  onReview: () => void;
  onExperiment: (experiment: ActiveExperiment) => void;
  onDecision: (decision: DecisionReceiptSummary) => void;
  onNotify: (message: string) => void;
};

function humanise(value: string): string {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function signedPct(value: number): string {
  return value < 0 ? `−${Math.abs(value)}%` : `+${value}%`;
}

function PageHeader({ icon: Icon, eyebrow, title, description, action }: { icon: LucideIcon; eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <header className="section-page-header">
      <div><span><Icon /> {eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
      {action}
    </header>
  );
}

function StatCard({ icon: Icon, label, value, detail, tone = 'cyan' }: { icon: LucideIcon; label: string; value: string; detail: string; tone?: string }) {
  return <article className={`section-stat ${tone}`}><i><Icon /></i><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>;
}

function IntelligencePage({ data, onOpenCopilot, onReview }: Pick<SectionPagesProps, 'data' | 'onOpenCopilot' | 'onReview'>) {
  const { bottleneck, recommendation } = data;
  return (
    <section id="section-intelligence" tabIndex={-1} className="section-page intelligence-workspace">
      <PageHeader icon={BrainCircuit} eyebrow="AXIOM INTELLIGENCE" title="Evidence, not guesses." description={`AXIOM analyzed the latest ${bottleneck.evidenceWindowDays}-day evidence window and found the highest-leverage intervention.`} action={<button className="section-primary" type="button" onClick={() => onOpenCopilot(`${bottleneck.stage}: ${bottleneck.summary}`)}><Sparkles /> Ask AXIOM <ArrowRight /></button>} />
      <div className="section-stat-grid">
        <StatCard icon={CircleAlert} label="Primary bottleneck" value={bottleneck.stage} detail={humanise(bottleneck.severity) + ' severity'} tone="pink" />
        <StatCard icon={TrendingUp} label="Drop-off" value={`${bottleneck.dropOffPct}%`} detail="At the detected stage" tone="violet" />
        <StatCard icon={Gauge} label="Recommendation confidence" value={`${recommendation.confidencePct}%`} detail={`${humanise(recommendation.riskLevel)} risk`} />
      </div>
      <div className="section-two-column intelligence-grid">
        <article className="section-card funnel-deep-dive"><header><span><GitBranch /> Evidence funnel</span><em>{bottleneck.evidenceWindowDays}D</em></header><h2>{bottleneck.stage}</h2><p>{bottleneck.summary}</p><div className="intelligence-funnel">{bottleneck.steps.map((step) => <div key={step.label} className={step.isBottleneck ? 'is-bottleneck' : ''}><span>{step.label}<small>{step.userCount.toLocaleString('en-IN')} users</small></span><i><b style={{ width: `${step.widthPct}%` }} /></i><strong>{step.conversionPct}%</strong></div>)}</div></article>
        <article className="section-card recommendation-deep-dive"><header><span><Sparkles /> Recommended intervention</span><em>{humanise(recommendation.status)}</em></header><h2>{recommendation.title}</h2><p>{recommendation.description}</p><div className="recommendation-score"><span><small>Predicted uplift</small><strong>{signedPct(recommendation.predictedUpliftPct)}</strong></span><span><small>Confidence</small><strong>{recommendation.confidencePct}%</strong></span></div><h3>Evidence</h3><ul>{recommendation.evidence.map((item) => <li key={item}><Check /> {item}</li>)}</ul><button className="section-primary wide" type="button" onClick={onReview}>Review proposed experiment <ArrowRight /></button></article>
      </div>
    </section>
  );
}

function ExperimentsPage({ data, onExperiment, onReview }: Pick<SectionPagesProps, 'data' | 'onExperiment' | 'onReview'>) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'running' | 'ready'>('all');
  const running = data.experiments.filter((item) => item.status === 'running').length;
  const averageProgress = Math.round(data.experiments.reduce((sum, item) => sum + item.progressPct, 0) / Math.max(data.experiments.length, 1));
  const averageLift = Number((data.experiments.reduce((sum, item) => sum + item.observedLiftPct, 0) / Math.max(data.experiments.length, 1)).toFixed(1));
  const filteredExperiments = data.experiments.filter((experiment) => {
    const matchesQuery = `${experiment.name} ${experiment.focusMetric}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesFilter = filter === 'all' || (filter === 'running' && experiment.status === 'running') || (filter === 'ready' && experiment.isConclusive);
    return matchesQuery && matchesFilter;
  });
  return (
    <section id="section-experiments" tabIndex={-1} className="section-page experiments-workspace">
      <PageHeader icon={FlaskConical} eyebrow="EXPERIMENT OPERATING SYSTEM" title="Run controlled growth experiments." description="Monitor evidence, guardrails and decision readiness across every active test." action={<button className="section-primary" type="button" onClick={onReview}><Play /> Review next experiment</button>} />
      <div className="section-stat-grid"><StatCard icon={Beaker} label="Running now" value={`${running}`} detail={`${data.experiments.length} total experiments`} /><StatCard icon={Timer} label="Average progress" value={`${averageProgress}%`} detail="Across active tests" tone="violet" /><StatCard icon={TrendingUp} label="Average observed lift" value={signedPct(averageLift)} detail="Not a final causal claim" tone="green" /></div>
      <article className="section-card experiment-board"><header><span><Beaker /> Experiment portfolio</span><em>Human approval required</em></header><div className="section-filterbar"><label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search experiments..." /></label><div>{(['all', 'running', 'ready'] as const).map((value) => <button type="button" key={value} className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{humanise(value)}</button>)}</div></div><div className="experiment-board-head"><span>Experiment</span><span>Metric</span><span>Status</span><span>Traffic</span><span>Progress</span><span>Observed lift</span></div>{filteredExperiments.map((experiment) => <button type="button" key={experiment.id} onClick={() => onExperiment(experiment)}><span><b>{experiment.name}</b><small>{experiment.isConclusive ? 'Decision-ready' : 'Collecting evidence'}</small></span><span>{experiment.focusMetric}</span><em>{humanise(experiment.status)}</em><span>{experiment.trafficPct}%</span><span className="board-progress"><i><b style={{ width: `${experiment.progressPct}%` }} /></i>{experiment.progressPct}%</span><strong>{signedPct(experiment.observedLiftPct)}</strong><ArrowRight /></button>)}{filteredExperiments.length === 0 && <p className="section-empty">No experiments match this filter.</p>}</article>
    </section>
  );
}

function AnalyticsPage({ data }: Pick<SectionPagesProps, 'data'>) {
  const { metrics, growth } = data;
  return (
    <section id="section-analytics" tabIndex={-1} className="section-page analytics-workspace">
      <PageHeader icon={BarChart3} eyebrow="GROWTH ANALYTICS" title="See the system behind the numbers." description={`${growth.metricLabel} performance and leading indicators across the latest ${growth.rangeLabel} window.`} />
      <div className="analytics-kpis">{metrics.map((metric) => <article key={metric.key} className={`analytics-kpi ${metric.tone}`}><small>{metric.label}</small><strong>{metric.displayValue}</strong><span className={metric.isImprovement ? 'good' : 'bad'}>{metric.direction === 'up' ? '↑' : metric.direction === 'down' ? '↓' : '→'} {Math.abs(metric.deltaPct)}%</span><em>{metric.comparisonLabel}</em></article>)}</div>
      <div className="section-two-column analytics-grid"><article className="section-card analytics-chart-card"><header><span><TrendingUp /> {growth.metricLabel} trajectory</span><em>{growth.rangeLabel}</em></header><div className="analytics-axis">{growth.axisLabels.map((label) => <span key={label}>{label}</span>)}</div><div className="analytics-bars">{growth.points.map((point, index) => <i key={point.occurredOn} style={{ height: `${(point.value / growth.axisMax) * 100}%`, '--bar-index': index } as CSSProperties}><b /></i>)}</div><svg className="analytics-line" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={growth.points.map((point, index) => `${index * (100 / Math.max(growth.points.length - 1, 1))},${100 - ((point.value / growth.axisMax) * 100)}`).join(' ')} vectorEffect="non-scaling-stroke" /></svg><div className="analytics-dates">{growth.xAxisLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div></article><article className="section-card metric-comparison"><header><span><Activity /> Metric comparison</span><em>vs prior 7d</em></header>{metrics.map((metric) => <div key={metric.key}><span><b>{metric.label}</b><small>{metric.displayValue}</small></span><i className={metric.isImprovement ? 'good' : 'bad'}>{metric.direction === 'up' ? '↑' : metric.direction === 'down' ? '↓' : '→'} {Math.abs(metric.deltaPct)}%</i></div>)}</article></div>
    </section>
  );
}

function SimulationsPage({ data, onReview }: Pick<SectionPagesProps, 'data' | 'onReview'>) {
  const { recommendation } = data;
  return (
    <section id="section-simulations" tabIndex={-1} className="section-page simulations-workspace">
      <PageHeader icon={Network} eyebrow="CAUSAL SIMULATION LAB" title="Model the move before you launch." description="Inspect assumptions, predicted upside and safety gates before sending traffic to an experiment." action={<button className="section-primary" type="button" onClick={onReview}><Play /> Review simulation</button>} />
      <div className="simulation-hero"><div className="simulation-orbit"><i /><i /><i /><span><Sparkles /><b>{signedPct(recommendation.predictedUpliftPct)}</b><small>Predicted uplift</small></span></div><div><span className="simulation-label">CURRENT RECOMMENDATION</span><h2>{recommendation.title}</h2><p>{recommendation.description}</p><div className="simulation-parameters"><span><small>Traffic</small><b>{recommendation.trafficPct}%</b></span><span><small>Duration</small><b>{recommendation.durationDays} days</b></span><span><small>Confidence</small><b>{recommendation.confidencePct}%</b></span><span><small>Risk</small><b>{humanise(recommendation.riskLevel)}</b></span></div></div></div>
      <div className="section-two-column simulation-grid"><article className="section-card"><header><span><ShieldCheck /> Reality Gate</span><em>{recommendation.realityGate.passed ? 'Passed' : 'Blocked'}</em></header><div className="gate-checks">{recommendation.realityGate.checks.map((check) => <div key={check.label} className={check.passed ? 'passed' : 'failed'}>{check.passed ? <CircleCheckBig /> : <CircleX />}<span><b>{check.label}</b><small>{check.detail}</small></span></div>)}</div></article><article className="section-card"><header><span><BrainCircuit /> Model assumptions</span><em>Review required</em></header><ul className="assumption-list">{recommendation.assumptions.map((item) => <li key={item}><CircleAlert /> {item}</li>)}</ul><button className="section-primary wide" type="button" onClick={onReview}>Open approval review <ArrowRight /></button></article></div>
    </section>
  );
}

function DecisionsPage({ data, onDecision }: Pick<SectionPagesProps, 'data' | 'onDecision'>) {
  const [filter, setFilter] = useState<'all' | 'verified' | 'monitoring' | 'rolled_back'>('all');
  const verified = data.decisions.filter((item) => item.outcome === 'verified').length;
  const monitoring = data.decisions.filter((item) => item.outcome === 'monitoring').length;
  const rolledBack = data.decisions.filter((item) => item.outcome === 'rolled_back').length;
  const filteredDecisions = data.decisions.filter((decision) => filter === 'all' || decision.outcome === filter);
  return (
    <section id="section-decisions" tabIndex={-1} className="section-page decisions-workspace">
      <PageHeader icon={ReceiptText} eyebrow="DECISION MEMORY" title="Every decision leaves a receipt." description="Trace what changed, why it changed and the impact observed after the decision." />
      <div className="section-stat-grid"><StatCard icon={CircleCheckBig} label="Verified" value={`${verified}`} detail="Validated decisions" tone="green" /><StatCard icon={Timer} label="Monitoring" value={`${monitoring}`} detail="Still gathering evidence" tone="violet" /><StatCard icon={CircleX} label="Rolled back" value={`${rolledBack}`} detail="Safety system activated" tone="pink" /></div>
      <article className="section-card decision-timeline"><header><span><ReceiptText /> Receipt timeline</span><em>{data.decisions.length} records</em></header><div className="section-filterbar outcome-filters"><span>Filter receipts</span><div>{(['all', 'verified', 'monitoring', 'rolled_back'] as const).map((value) => <button type="button" key={value} className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{humanise(value)}</button>)}</div></div>{filteredDecisions.map((decision) => <button key={decision.id} type="button" className={decision.outcome} onClick={() => onDecision(decision)}><i>{decision.outcome === 'verified' ? <CircleCheckBig /> : decision.outcome === 'rolled_back' ? <CircleX /> : <Timer />}</i><span><small>{decision.decidedAtDisplay}</small><b>{decision.title}</b><p>{decision.summary}</p></span><em>{humanise(decision.outcome)}</em><strong>{signedPct(decision.impactPct)}</strong><ArrowRight /></button>)}{filteredDecisions.length === 0 && <p className="section-empty">No decision receipts match this filter.</p>}</article>
    </section>
  );
}

function IntegrationsPage({ data, onNotify }: Pick<SectionPagesProps, 'data' | 'onNotify'>) {
  const planned = [{ name: 'Stripe', detail: 'Revenue and subscription events', icon: Database }, { name: 'PostHog', detail: 'Product analytics events', icon: Activity }, { name: 'GA4', detail: 'Acquisition and conversion data', icon: BarChart3 }, { name: 'Webhooks', detail: 'Custom event pipelines', icon: Webhook }];
  return (
    <section id="section-integrations" tabIndex={-1} className="section-page integrations-workspace">
      <PageHeader icon={Puzzle} eyebrow="DATA CONNECTIONS" title="Connect the full growth system." description="Bring product, revenue and experimentation evidence into one governed workspace." />
      <article className="active-connection"><i><Database /></i><div><small>ACTIVE DATA SOURCE</small><h2>AXIOM Persistent API</h2><p>{data.dataSourceNote}</p></div><span><b /> {data.storage ? `Connected · r${data.storage.revision}` : 'Connected'}</span></article>
      <div className="integration-grid">{planned.map(({ name, detail, icon: Icon }) => <article className="section-card" key={name}><i><Icon /></i><div><h3>{name}</h3><p>{detail}</p></div><em>Planned</em><button type="button" onClick={() => onNotify(`${name} connector is planned for a future AXIOM phase`)}>View plan <ArrowRight /></button></article>)}</div>
      <div className="integration-security"><Lock /><span><b>Private by design</b><small>Connection credentials will be encrypted and scoped per workspace when live connectors are added.</small></span></div>
    </section>
  );
}

function SettingsPage({ data, onNotify }: Pick<SectionPagesProps, 'data' | 'onNotify'>) {
  const { workspace } = data;
  return (
    <section id="section-settings" tabIndex={-1} className="section-page settings-workspace">
      <PageHeader icon={Settings} eyebrow="WORKSPACE CONTROL" title="Settings & governance." description="Review signed-in identity, workspace environment and dashboard preferences." />
      <div className="section-two-column settings-grid"><article className="section-card settings-card"><header><span><Building2 /> Workspace profile</span><em>{data.storage ? `Saved · r${data.storage.revision}` : humanise(workspace.environment)}</em></header><label><span>Workspace name</span><input value={workspace.name} readOnly /></label><label><span>Signed-in account</span><input value={data.session?.email ?? 'Local development'} readOnly /></label><label><span>Objective</span><input value={workspace.objective ?? 'Growth optimization'} readOnly /></label><label><span>Workspace ID</span><input value={workspace.id} readOnly /></label></article><article className="section-card settings-card"><header><span><BellRing /> Dashboard preferences</span><em>This device</em></header>{['Bottleneck alerts', 'Experiment updates', 'Decision receipts', 'System health notices'].map((label, index) => <label className="setting-toggle" key={label}><span><b>{label}</b><small>{index === 0 ? 'Alert when a high-severity growth constraint is found' : 'Show this update inside the AXIOM dashboard'}</small></span><input type="checkbox" defaultChecked onChange={(event) => onNotify(`${label} ${event.target.checked ? 'enabled' : 'disabled'} for this device`)} /><i /></label>)}</article></div>
      <div className="settings-security"><ShieldCheck /><span><b>Human approval stays enabled</b><small>AXIOM V1 will not launch a live experiment without explicit approval.</small></span><em>Protected</em></div>
    </section>
  );
}

export function SectionPages(props: SectionPagesProps) {
  switch (props.activeNav) {
    case 'Intelligence': return <IntelligencePage data={props.data} onOpenCopilot={props.onOpenCopilot} onReview={props.onReview} />;
    case 'Experiments': return <ExperimentsPage data={props.data} onExperiment={props.onExperiment} onReview={props.onReview} />;
    case 'Analytics': return <AnalyticsPage data={props.data} />;
    case 'Simulations': return <SimulationsPage data={props.data} onReview={props.onReview} />;
    case 'Decisions': return <DecisionsPage data={props.data} onDecision={props.onDecision} />;
    case 'Integrations': return <IntegrationsPage data={props.data} onNotify={props.onNotify} />;
    case 'Settings': return <SettingsPage data={props.data} onNotify={props.onNotify} />;
    default: return null;
  }
}
