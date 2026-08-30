import { ensureDatabase, getDatabase } from '../../../../db';
import { assignVariant, type ExperimentVariant } from '../../../lib/server/feature-flags';
import { transitionExperiment } from '../../../lib/server/experiment-state';
import { persistManualRollbackReceipt, recomputeExperiment } from '../../../lib/server/experiment-runtime';
import { requestIdentity, type RequestIdentity } from '../../../lib/server/request-identity';
import { resolveWorkspaceAccess } from '../../../lib/server/workspace-access';
import { enforceRateLimit, secureJson } from '../../../lib/server/http-security';

export const dynamic = 'force-dynamic';

type FlagRow = {
  flag_key: string; experiment_id: string; status: string; allocation_pct: number; salt: string;
};

function json(body: unknown, status = 200): Response {
  return secureJson(body, status);
}

function clean(value: unknown, field: string, max = 120): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > max) {
    throw new Error(`${field} must be between 1 and ${max} characters.`);
  }
  return value.trim();
}

async function authorize(request: Request, workspaceId: string): Promise<{ identity: RequestIdentity; role: 'owner' | 'admin' | 'analyst' | 'viewer' } | Response> {
  const identity = await requestIdentity(request);
  if (!identity) return json({ code: 'authentication_required', message: 'Sign in to use experiment delivery.', details: null }, 401);
  await ensureDatabase();
  const now = new Date().toISOString();
  await getDatabase().prepare(`INSERT INTO axiom_users (id, email, display_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = excluded.updated_at`)
    .bind(identity.userId, identity.email.toLowerCase(), identity.displayName, now, now).run();
  const access = await resolveWorkspaceAccess(identity, workspaceId);
  if (access.active.id !== workspaceId) return json({ code: 'workspace_forbidden', message: 'That workspace is not available to this account.', details: null }, 403);
  return { identity, role: access.organization.role };
}

async function loadFlag(workspaceId: string, flagKey: string): Promise<FlagRow | null> {
  return getDatabase().prepare(`SELECT key AS flag_key, experiment_id, status, allocation_pct, salt
    FROM feature_flags WHERE workspace_id = ? AND key = ?`).bind(workspaceId, flagKey).first<FlagRow>();
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const workspaceId = clean(url.searchParams.get('workspaceId'), 'workspaceId');
    const flagKey = clean(url.searchParams.get('flagKey'), 'flagKey');
    const subjectId = clean(url.searchParams.get('subjectId'), 'subjectId');
    const authorized = await authorize(request, workspaceId);
    if (authorized instanceof Response) return authorized;
    const flag = await loadFlag(workspaceId, flagKey);
    if (!flag) return json({ code: 'flag_not_found', message: 'No feature flag exists with that key in this workspace.', details: null }, 404);

    const db = getDatabase();
    const existing = await db.prepare(`SELECT variant, assigned_at FROM experiment_assignments
      WHERE workspace_id = ? AND experiment_id = ? AND subject_id = ?`)
      .bind(workspaceId, flag.experiment_id, subjectId).first<{ variant: ExperimentVariant; assigned_at: string }>();
    const calculated = assignVariant({ workspaceId, flagKey, subjectId, salt: flag.salt, allocationPct: flag.allocation_pct, status: flag.status });
    const stickyVariant = existing?.variant ?? calculated.variant;
    const effectiveVariant: ExperimentVariant = flag.status === 'running' ? stickyVariant : 'control';
    const assignedAt = existing?.assigned_at ?? new Date().toISOString();
    if (!existing) {
      await db.prepare(`INSERT INTO experiment_assignments (workspace_id, experiment_id, subject_id, variant, assigned_at)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT(workspace_id, experiment_id, subject_id) DO NOTHING`)
        .bind(workspaceId, flag.experiment_id, subjectId, stickyVariant, assignedAt).run();
    }
    return json({ workspaceId, flagKey, experimentId: flag.experiment_id, subjectId, variant: effectiveVariant, assignedVariant: stickyVariant, enabled: flag.status === 'running', bucket: calculated.bucket, assignedAt });
  } catch (error) {
    if (error instanceof Error && error.message.includes('must be')) return json({ code: 'invalid_assignment_request', message: error.message, details: null }, 400);
    console.error('AXIOM assignment failed', error);
    return json({ code: 'assignment_failed', message: 'AXIOM could not resolve this assignment.', details: null }, 500);
  }
}

type ExperimentAction = {
  action?: unknown; workspaceId?: unknown; experimentId?: unknown; subjectId?: unknown;
  variant?: unknown; idempotencyKey?: unknown; exposedAt?: unknown; metricKey?:unknown; converted?:unknown; guardrailBreached?:unknown; observedAt?:unknown;
};

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => null) as ExperimentAction | null;
    if (!body) return json({ code: 'invalid_json', message: 'A JSON experiment action is required.', details: null }, 400);
    const action = clean(body.action, 'action', 40);
    const workspaceId = clean(body.workspaceId, 'workspaceId');
    const experimentId = clean(body.experimentId, 'experimentId');
    const authorized = await authorize(request, workspaceId);
    if (authorized instanceof Response) return authorized;
    const limited = await enforceRateLimit(request, 'experiments:write', 2000, 60); if (limited) return limited;
    const db = getDatabase();
    const experiment = await db.prepare('SELECT status, primary_metric FROM experiment_definitions WHERE workspace_id = ? AND id = ?')
      .bind(workspaceId, experimentId).first<{ status: string; primary_metric:string }>();
    if (!experiment) return json({ code: 'experiment_not_found', message: 'That experiment does not exist in this workspace.', details: null }, 404);

    if (action === 'record_exposure') {
      if(experiment.status!=='running')return json({code:'experiment_not_running',message:'Exposure can only be recorded while the experiment is running.',details:null},409);
      const subjectId = clean(body.subjectId, 'subjectId');
      const variant = clean(body.variant, 'variant', 20) as ExperimentVariant;
      if (!['control', 'treatment'].includes(variant)) return json({ code: 'invalid_variant', message: 'variant must be control or treatment.', details: null }, 400);
      const idempotencyKey = clean(body.idempotencyKey, 'idempotencyKey');
      const assigned = await db.prepare(`SELECT variant FROM experiment_assignments
        WHERE workspace_id = ? AND experiment_id = ? AND subject_id = ?`)
        .bind(workspaceId, experimentId, subjectId).first<{ variant: ExperimentVariant }>();
      if (!assigned || assigned.variant !== variant) return json({ code: 'assignment_mismatch', message: 'Resolve and use the persisted assignment before recording exposure.', details: null }, 409);
      const exposedAt = body.exposedAt ? new Date(clean(body.exposedAt, 'exposedAt', 40)) : new Date();
      if (Number.isNaN(exposedAt.getTime()) || exposedAt.getTime() > Date.now() + 5 * 60_000) return json({ code: 'invalid_exposure_time', message: 'exposedAt must be a valid non-future timestamp.', details: null }, 400);
      const result = await db.prepare(`INSERT INTO experiment_exposures
        (id, workspace_id, experiment_id, subject_id, variant, idempotency_key, exposed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(workspace_id, idempotency_key) DO NOTHING`)
        .bind(crypto.randomUUID(), workspaceId, experimentId, subjectId, variant, idempotencyKey, exposedAt.toISOString()).run();
      const inserted = Number(result.meta.changes ?? 0);
      return json({ accepted: true, inserted, duplicate: inserted === 0, experimentId, subjectId, variant }, 202);
    }

    if(action==='record_outcome'){
      if(experiment.status!=='running')return json({code:'experiment_not_running',message:'Outcome can only be recorded while the experiment is running.',details:null},409);
      const subjectId=clean(body.subjectId,'subjectId'); const variant=clean(body.variant,'variant',20) as ExperimentVariant; const metricKey=clean(body.metricKey,'metricKey',80).toLowerCase().replace(/[^a-z0-9]+/g,'_'); const idempotencyKey=clean(body.idempotencyKey,'idempotencyKey');
      if(!['control','treatment'].includes(variant))return json({code:'invalid_variant',message:'variant must be control or treatment.',details:null},400);
      if(typeof body.converted!=='boolean'||typeof body.guardrailBreached!=='boolean')return json({code:'invalid_outcome',message:'converted and guardrailBreached must be boolean.',details:null},400);
      const expectedMetric=experiment.primary_metric.toLowerCase().replace(/[^a-z0-9]+/g,'_');if(metricKey!==expectedMetric)return json({code:'metric_mismatch',message:`metricKey must be ${expectedMetric} for this experiment.`,details:null},409);
      const assignment=await db.prepare(`SELECT a.variant FROM experiment_assignments a WHERE a.workspace_id=? AND a.experiment_id=? AND a.subject_id=? AND EXISTS (SELECT 1 FROM experiment_exposures x WHERE x.workspace_id=a.workspace_id AND x.experiment_id=a.experiment_id AND x.subject_id=a.subject_id)`).bind(workspaceId,experimentId,subjectId).first<{variant:ExperimentVariant}>();
      if(!assignment||assignment.variant!==variant)return json({code:'exposure_required',message:'A matching persisted assignment and exposure are required before an outcome.',details:null},409);
      const observedAt=body.observedAt?new Date(clean(body.observedAt,'observedAt',40)):new Date(); if(Number.isNaN(observedAt.getTime())||observedAt.getTime()>Date.now()+300000)return json({code:'invalid_outcome_time',message:'observedAt must be a valid non-future timestamp.',details:null},400);
      const existingOutcome=await db.prepare(`SELECT id FROM experiment_outcomes WHERE workspace_id=? AND experiment_id=? AND subject_id=? AND metric_key=?`).bind(workspaceId,experimentId,subjectId,metricKey).first();if(existingOutcome){const runtime=await recomputeExperiment(workspaceId,experimentId);return json({accepted:true,inserted:0,duplicate:true,experimentId,...runtime},202);}
      const inserted=await db.prepare(`INSERT INTO experiment_outcomes (id,workspace_id,experiment_id,subject_id,variant,metric_key,converted,guardrail_breached,idempotency_key,observed_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id,idempotency_key) DO NOTHING`).bind(crypto.randomUUID(),workspaceId,experimentId,subjectId,variant,metricKey,body.converted?1:0,body.guardrailBreached?1:0,idempotencyKey,observedAt.toISOString()).run();
      const runtime=await recomputeExperiment(workspaceId,experimentId); return json({accepted:true,inserted:Number(inserted.meta.changes??0),duplicate:Number(inserted.meta.changes??0)===0,experimentId,...runtime},202);
    }

    if (!['pause', 'resume', 'rollback'].includes(action)) return json({ code: 'invalid_action', message: 'action must be record_exposure, record_outcome, pause, resume or rollback.', details: null }, 400);
    if (!['owner', 'admin'].includes(authorized.role)) return json({ code: 'insufficient_role', message: 'Only an owner or admin can change experiment delivery.', details: null }, 403);
    const nextStatus = transitionExperiment(experiment.status, action);
    if (!nextStatus) return json({ code: 'invalid_transition', message: `Experiment cannot transition from ${experiment.status} with ${action}.`, details: null }, 409);
    const now = new Date().toISOString();
    await db.batch([
      db.prepare('UPDATE experiment_definitions SET status = ?, updated_at = ? WHERE workspace_id = ? AND id = ?').bind(nextStatus, now, workspaceId, experimentId),
      db.prepare('UPDATE feature_flags SET status = ?, updated_at = ? WHERE workspace_id = ? AND experiment_id = ?').bind(nextStatus, now, workspaceId, experimentId),
      db.prepare(`INSERT INTO audit_events (id, user_id, action, entity_type, entity_id, metadata_json, created_at)
        VALUES (?, ?, ?, 'experiment', ?, ?, ?)`).bind(crypto.randomUUID(), authorized.identity.userId, `experiment_${action}`, experimentId, JSON.stringify({ workspaceId, previousStatus: experiment.status, nextStatus }), now),
    ]);
    if(action==='rollback')await persistManualRollbackReceipt(workspaceId,experimentId);
    return json({ experimentId, previousStatus: experiment.status, status: nextStatus, flagEnabled: nextStatus === 'running' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('must be')) return json({ code: 'invalid_experiment_action', message: error.message, details: null }, 400);
    console.error('AXIOM experiment action failed', error);
    return json({ code: 'experiment_action_failed', message: 'AXIOM could not apply this experiment action.', details: null }, 500);
  }
}
