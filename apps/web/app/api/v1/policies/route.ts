import { ensureDatabase, getDatabase } from '../../../../db';
import { loadRiskPolicy } from '../../../lib/server/experiment-runtime';
import { secureJson } from '../../../lib/server/http-security';
import { requestIdentity } from '../../../lib/server/request-identity';
import { resolveWorkspaceAccess } from '../../../lib/server/workspace-access';

export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) { return secureJson(body, status); }

async function access(request: Request, workspaceId: string) {
  const identity = await requestIdentity(request);
  if (!identity) return json({ code: 'authentication_required', message: 'Sign in to manage policies.', details: null }, 401);
  await ensureDatabase();
  const resolved = await resolveWorkspaceAccess(identity, workspaceId);
  if (resolved.active.id !== workspaceId) return json({ code: 'workspace_forbidden', message: 'That workspace is not available.', details: null }, 403);
  return { identity, role: resolved.organization.role };
}

export async function GET(request: Request) {
  const workspaceId = new URL(request.url).searchParams.get('workspaceId');
  if (!workspaceId) return json({ code: 'workspace_required', message: 'workspaceId is required.', details: null }, 400);
  const authorized = await access(request, workspaceId);
  if (authorized instanceof Response) return authorized;
  return json(await loadRiskPolicy(workspaceId));
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId : '';
    if (!workspaceId) return json({ code: 'workspace_required', message: 'workspaceId is required.', details: null }, 400);
    const authorized = await access(request, workspaceId);
    if (authorized instanceof Response) return authorized;
    if (!['owner', 'admin'].includes(authorized.role)) return json({ code: 'insufficient_role', message: 'Only owner or admin can update risk policy.', details: null }, 403);
    const integer = (key: string, min: number, max: number) => {
      const value = body?.[key];
      if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) throw new Error(`${key} must be an integer from ${min} to ${max}.`);
      return Number(value);
    };
    if (typeof body?.autoRollback !== 'boolean') throw new Error('autoRollback must be boolean.');
    const policy = {
      maxTrafficPct: integer('maxTrafficPct', 1, 100),
      minObservedUsers: integer('minObservedUsers', 1, 100000),
      minSubjectsPerVariant: integer('minSubjectsPerVariant', 10, 100000),
      confidenceThresholdPct: integer('confidenceThresholdPct', 90, 99),
      maxGuardrailIncreasePct: integer('maxGuardrailIncreasePct', 0, 100),
      autoRollback: body.autoRollback,
    };
    const now = new Date().toISOString();
    await getDatabase().batch([
      getDatabase().prepare(`INSERT INTO workspace_risk_policies (workspace_id,max_traffic_pct,min_observed_users,min_subjects_per_variant,confidence_threshold_pct,max_guardrail_increase_pct,auto_rollback,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET max_traffic_pct=excluded.max_traffic_pct,min_observed_users=excluded.min_observed_users,min_subjects_per_variant=excluded.min_subjects_per_variant,confidence_threshold_pct=excluded.confidence_threshold_pct,max_guardrail_increase_pct=excluded.max_guardrail_increase_pct,auto_rollback=excluded.auto_rollback,updated_at=excluded.updated_at`).bind(workspaceId, policy.maxTrafficPct, policy.minObservedUsers, policy.minSubjectsPerVariant, policy.confidenceThresholdPct, policy.maxGuardrailIncreasePct, policy.autoRollback ? 1 : 0, now),
      getDatabase().prepare(`INSERT INTO audit_events (id,user_id,action,entity_type,entity_id,metadata_json,created_at) VALUES (?,?,'update_risk_policy','workspace',?,?,?)`).bind(crypto.randomUUID(), authorized.identity.userId, workspaceId, JSON.stringify(policy), now),
    ]);
    return json(policy);
  } catch (error) {
    if (error instanceof Error && error.message.includes('must be')) return json({ code: 'invalid_policy', message: error.message, details: null }, 400);
    console.error('policy update failed', error);
    return json({ code: 'policy_update_failed', message: 'AXIOM could not update policy.', details: null }, 500);
  }
}
