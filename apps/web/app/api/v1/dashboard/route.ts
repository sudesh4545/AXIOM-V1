import { ensureDatabase, getDatabase } from '../../../../db';
import type { DashboardResponse, DecisionReceiptSummary } from '../../../lib/axiom-contract';
import { createBundledDemoOverview } from '../../../lib/demo-overview';
import { loadIngestionSummary } from '../../../lib/server/ingestion';
import { applyWorkspaceMeasurement } from '../../../lib/server/measurement';
import { featureFlagKey } from '../../../lib/server/feature-flags';
import { rankOpportunities } from '../../../lib/server/opportunity-engine';
import { loadRiskPolicy } from '../../../lib/server/experiment-runtime';
import { evaluatePreLaunch } from '../../../lib/server/risk-policy';
import type { ExperimentAnalysis } from '../../../lib/server/experiment-analysis';
import { firstName, requestIdentity, type RequestIdentity } from '../../../lib/server/request-identity';
import { resolveWorkspaceAccess, selectWorkspace, type WorkspaceAccess } from '../../../lib/server/workspace-access';
import { enforceRateLimit, secureJson } from '../../../lib/server/http-security';

export const dynamic = 'force-dynamic';

type SnapshotRow = {
  payload_json: string;
  revision: number;
  updated_at: string;
};

function json(body: unknown, status = 200): Response {
  return secureJson(body, status);
}

async function upsertUser(identity: RequestIdentity, now: string): Promise<void> {
  await getDatabase().prepare(`INSERT INTO axiom_users (id, email, display_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = excluded.updated_at`)
    .bind(identity.userId, identity.email.toLowerCase(), identity.displayName, now, now).run();
}

async function readOrCreateSnapshot(identity: RequestIdentity, access: WorkspaceAccess): Promise<SnapshotRow> {
  const db = getDatabase();
  const existing = await db.prepare(`SELECT payload_json, revision, updated_at
    FROM workspace_dashboard_snapshots WHERE user_id = ? AND workspace_id = ?`)
    .bind(identity.userId, access.active.id).first<SnapshotRow>();
  if (existing) return existing;

  const now = new Date().toISOString();
  const payload = createBundledDemoOverview();
  payload.workspace = access.active;
  payload.operatorFirstName = firstName(identity);
  payload.dataSourceNote = `${access.active.name} is using persistent demo seed data. Connect a product source to replace it with measured results.`;
  await db.prepare(`INSERT INTO workspace_dashboard_snapshots (user_id, workspace_id, payload_json, revision, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?)`)
    .bind(identity.userId, access.active.id, JSON.stringify(payload), now, now).run();
  return { payload_json: JSON.stringify(payload), revision: 1, updated_at: now };
}

async function attachRuntimeState(row: SnapshotRow, identity: RequestIdentity, access: WorkspaceAccess): Promise<DashboardResponse> {
  const payload = JSON.parse(row.payload_json) as DashboardResponse;
  payload.workspace = access.active;
  payload.operatorFirstName = firstName(identity);
  payload.session = identity;
  payload.workspaceContext = { ...access.organization, availableWorkspaces: access.available };
  const [ingestion] = await Promise.all([
    loadIngestionSummary(access.active.id),
    applyWorkspaceMeasurement(payload, access.active.id),
  ]);
  payload.ingestion = ingestion;
  payload.opportunities ??= rankOpportunities(payload.bottleneck, payload.measurement?.observedUsers ?? 0);
  await syncApprovedExperimentDelivery(payload, access.active.id);
  await attachExperimentDeliveryState(payload, access.active.id);
  payload.riskPolicy = await loadRiskPolicy(access.active.id);
  await attachDecisionReceipts(payload, access.active.id);
  payload.storage = { state: 'connected', revision: row.revision, lastSavedAt: row.updated_at };
  payload.systemStatus = { state: 'healthy', label: 'Live', message: 'API and database connected' };
  return payload;
}

async function attachExperimentDeliveryState(payload: DashboardResponse, workspaceId: string): Promise<void> {
  const rows = (await getDatabase().prepare(`SELECT e.id, e.status, a.analysis_json FROM experiment_definitions e LEFT JOIN experiment_analyses a ON a.experiment_id=e.id WHERE e.workspace_id = ?`)
    .bind(workspaceId).all<{ id: string; status: DashboardResponse['experiments'][number]['status']; analysis_json:string|null }>()).results;
  const statuses = new Map(rows.map((row) => [row.id, row.status]));
  const analyses=new Map(rows.filter((row)=>row.analysis_json).map((row)=>[row.id,JSON.parse(row.analysis_json as string) as ExperimentAnalysis]));
  payload.experiments = payload.experiments.map((experiment) => {const analysis=analyses.get(experiment.id); return statuses.has(experiment.id)
    ? { ...experiment, status: statuses.get(experiment.id) ?? experiment.status, progressPct:analysis?Math.min(100,Math.round((analysis.control.subjects+analysis.treatment.subjects)/60*100)):experiment.progressPct, observedLiftPct:analysis?.absoluteLiftPct??experiment.observedLiftPct, guardrailBreached:analysis?.decision==='guardrail_rollback', isConclusive:analysis?.isConclusive??experiment.isConclusive, analysis:analysis?{controlSubjects:analysis.control.subjects,treatmentSubjects:analysis.treatment.subjects,probabilityTreatmentBetterPct:analysis.probabilityTreatmentBetterPct,confidenceIntervalPct:analysis.confidenceIntervalPct,decision:analysis.decision,rationale:analysis.rationale}:undefined }
    : experiment;});
  const approvedStatus = statuses.get(`approved-${payload.recommendation.id}`);
  if (approvedStatus) payload.recommendation.status = approvedStatus;
}

async function attachDecisionReceipts(payload:DashboardResponse,workspaceId:string):Promise<void>{
  const rows=(await getDatabase().prepare(`SELECT id,outcome,payload_json,created_at FROM decision_receipts WHERE workspace_id=? ORDER BY created_at DESC LIMIT 20`).bind(workspaceId).all<{id:string;outcome:DecisionReceiptSummary['outcome'];payload_json:string;created_at:string}>()).results;
  const live=rows.map((row)=>{const detail=JSON.parse(row.payload_json) as {hypothesis?:string;observedResult?:ExperimentAnalysis;finalDecision?:string};const impact=detail.observedResult?.absoluteLiftPct??0;return {id:row.id,title:`${detail.finalDecision==='verified'?'Verified outcome':detail.finalDecision==='rolled_back'?'Safety rollback':'Experiment decision'}: ${detail.hypothesis??'bounded experiment'}`,decidedAt:row.created_at,decidedAtDisplay:`Decided ${new Date(row.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}, ${new Date(row.created_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}`,outcome:row.outcome,impactPct:impact,summary:detail.observedResult?.rationale??'Auditable experiment decision.'} satisfies DecisionReceiptSummary;});
  const liveIds=new Set(live.map((item)=>item.id));payload.decisions=[...live,...payload.decisions.filter((item)=>!liveIds.has(item.id))];
}

async function syncApprovedExperimentDelivery(payload: DashboardResponse, workspaceId: string): Promise<void> {
  const recommendation = payload.recommendation;
  const experimentId = `approved-${recommendation.id}`;
  if (!payload.experiments.some((experiment) => experiment.id === experimentId)) return;
  const now = new Date().toISOString();
  const db = getDatabase();
  await db.batch([
    db.prepare(`INSERT INTO experiment_definitions
      (id, workspace_id, recommendation_id, name, hypothesis, primary_metric, guardrail_metric, status, traffic_pct, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'Churn Rate', 'running', ?, ?, ?)
      ON CONFLICT(workspace_id, recommendation_id) DO NOTHING`)
      .bind(experimentId, workspaceId, recommendation.id, recommendation.title, recommendation.description, recommendation.focusMetric, recommendation.trafficPct, now, now),
    db.prepare(`INSERT INTO feature_flags
      (key, workspace_id, experiment_id, status, allocation_pct, salt, created_at, updated_at)
      VALUES (?, ?, ?, 'running', ?, ?, ?, ?)
      ON CONFLICT(workspace_id, key) DO NOTHING`)
      .bind(featureFlagKey(recommendation.id), workspaceId, experimentId, recommendation.trafficPct, crypto.randomUUID(), now, now),
  ]);
}

async function loadDashboard(request: Request): Promise<{ identity: RequestIdentity; access: WorkspaceAccess; row: SnapshotRow; payload: DashboardResponse } | Response> {
  const identity = requestIdentity(request);
  if (!identity) return json({ code: 'authentication_required', message: 'Sign in to open AXIOM.', details: null }, 401);

  await ensureDatabase();
  const now = new Date().toISOString();
  await upsertUser(identity, now);
  const requestedWorkspaceId = new URL(request.url).searchParams.get('workspaceId');
  const access = await resolveWorkspaceAccess(identity, requestedWorkspaceId);
  if (requestedWorkspaceId && access.active.id !== requestedWorkspaceId) {
    return json({ code: 'workspace_forbidden', message: 'That workspace is not available to this account.', details: null }, 403);
  }
  const row = await readOrCreateSnapshot(identity, access);
  return { identity, access, row, payload: await attachRuntimeState(row, identity, access) };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const loaded = await loadDashboard(request);
    if (loaded instanceof Response) return loaded;
    return json(loaded.payload);
  } catch (error) {
    console.error('AXIOM dashboard read failed', error);
    return json({ code: 'dashboard_unavailable', message: 'AXIOM persistent dashboard could not be loaded.', details: null }, 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const loaded = await loadDashboard(request);
    if (loaded instanceof Response) return loaded;
    const limited = await enforceRateLimit(request, 'dashboard:write', 60, 60); if (limited) return limited;

    const body = await request.json().catch(() => null) as { action?: string; recommendationId?: string; workspaceId?: string } | null;
    if (body?.action === 'select_workspace' && body.workspaceId) {
      const access = await selectWorkspace(loaded.identity, body.workspaceId);
      if (!access) return json({ code: 'workspace_forbidden', message: 'That workspace is not available to this account.', details: null }, 403);
      const row = await readOrCreateSnapshot(loaded.identity, access);
      return json(await attachRuntimeState(row, loaded.identity, access));
    }

    if (body?.action !== 'approve_recommendation' || body.recommendationId !== loaded.payload.recommendation.id) {
      return json({ code: 'invalid_action', message: 'This dashboard action is not supported.', details: null }, 400);
    }

    if (!['owner', 'admin'].includes(loaded.access.organization.role)) {
      return json({ code: 'insufficient_role', message: 'Only an owner or admin can approve a live experiment.', details: null }, 403);
    }

    const policy = await loadRiskPolicy(loaded.access.active.id);
    const policyResult = evaluatePreLaunch(loaded.payload.recommendation, loaded.payload.measurement?.observedUsers ?? 0, policy);
    if (!policyResult.passed) {
      return json({ code: 'risk_policy_blocked', message: 'The workspace risk policy blocked this launch.', details: { checks: policyResult.checks } }, 409);
    }

    if (!loaded.payload.recommendation.realityGate.passed || !loaded.payload.recommendation.realityGate.requiresHumanApproval) {
      return json({ code: 'reality_gate_failed', message: 'The experiment cannot be approved until every safety check passes.', details: null }, 409);
    }

    const now = new Date();
    const recommendation = loaded.payload.recommendation;
    const experimentId = `approved-${recommendation.id}`;
    const alreadyApproved = loaded.payload.experiments.some((experiment) => experiment.id === experimentId);

    if (!alreadyApproved) {
      recommendation.status = 'running';
      loaded.payload.experiments.unshift({
        id: experimentId,
        name: recommendation.title,
        focusMetric: recommendation.focusMetric,
        status: 'running',
        progressPct: 0,
        observedLiftPct: 0,
        trafficPct: recommendation.trafficPct,
        guardrailBreached: false,
        isConclusive: false,
      });
      const receipt: DecisionReceiptSummary = {
        id: `approval-${recommendation.id}`,
        title: `Approved canary: ${recommendation.title}`,
        decidedAt: now.toISOString(),
        decidedAtDisplay: `Decided ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
        outcome: 'monitoring',
        impactPct: 0,
        summary: `Human-approved ${recommendation.trafficPct}% canary. AXIOM is monitoring guardrails before any wider rollout.`,
      };
      loaded.payload.decisions.unshift(receipt);
    }

    const nextRevision = alreadyApproved ? loaded.row.revision : loaded.row.revision + 1;
    const savedAt = now.toISOString();
    const persistedPayload = { ...loaded.payload, session: undefined, workspaceContext: undefined, storage: undefined };
    if (!alreadyApproved) {
      const db = getDatabase();
      await db.batch([
        db.prepare(`UPDATE workspace_dashboard_snapshots SET payload_json = ?, revision = ?, updated_at = ?
          WHERE user_id = ? AND workspace_id = ?`)
          .bind(JSON.stringify(persistedPayload), nextRevision, savedAt, loaded.identity.userId, loaded.access.active.id),
        db.prepare(`INSERT INTO audit_events (id, user_id, action, entity_type, entity_id, metadata_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(crypto.randomUUID(), loaded.identity.userId, 'approve_recommendation', 'recommendation', recommendation.id, JSON.stringify({ trafficPct: recommendation.trafficPct, workspaceId: loaded.access.active.id }), savedAt),
        db.prepare(`INSERT INTO experiment_definitions
          (id, workspace_id, recommendation_id, name, hypothesis, primary_metric, guardrail_metric, status, traffic_pct, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'Churn Rate', 'running', ?, ?, ?)
          ON CONFLICT(workspace_id, recommendation_id) DO NOTHING`)
          .bind(experimentId, loaded.access.active.id, recommendation.id, recommendation.title, recommendation.description, recommendation.focusMetric, recommendation.trafficPct, savedAt, savedAt),
        db.prepare(`INSERT INTO feature_flags
          (key, workspace_id, experiment_id, status, allocation_pct, salt, created_at, updated_at)
          VALUES (?, ?, ?, 'running', ?, ?, ?, ?)
          ON CONFLICT(workspace_id, key) DO NOTHING`)
          .bind(featureFlagKey(recommendation.id), loaded.access.active.id, experimentId, recommendation.trafficPct, crypto.randomUUID(), savedAt, savedAt),
      ]);
    }

    const responseRow = { payload_json: JSON.stringify(persistedPayload), revision: nextRevision, updated_at: alreadyApproved ? loaded.row.updated_at : savedAt };
    return json(await attachRuntimeState(responseRow, loaded.identity, loaded.access));
  } catch (error) {
    console.error('AXIOM dashboard write failed', error);
    return json({ code: 'dashboard_write_failed', message: 'AXIOM could not save this approval.', details: null }, 500);
  }
}
