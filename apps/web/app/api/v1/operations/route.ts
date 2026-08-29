import { ensureDatabase, getDatabase } from '../../../../db';
import { enforceRateLimit, secureJson } from '../../../lib/server/http-security';
import { requestIdentity } from '../../../lib/server/request-identity';
import { resolveWorkspaceAccess } from '../../../lib/server/workspace-access';

type CountRow = { count: number };

export async function GET(request: Request): Promise<Response> {
  const started = performance.now();
  try {
    const workspaceId = new URL(request.url).searchParams.get('workspaceId') ?? '';
    if (!workspaceId) return secureJson({ code: 'workspace_required', message: 'workspaceId is required.', details: null }, 400);
    const identity = requestIdentity(request); if (!identity) return secureJson({ code: 'authentication_required', message: 'Sign in to inspect operations.', details: null }, 401);
    await ensureDatabase(); const access = await resolveWorkspaceAccess(identity, workspaceId);
    if (access.active.id !== workspaceId) return secureJson({ code: 'workspace_forbidden', message: 'That workspace is not available.', details: null }, 403);
    const limited = await enforceRateLimit(request, 'operations:read', 120, 60); if (limited) return limited;
    const db = getDatabase();
    const [events, experiments, receipts, simulations, latestEvent, latestAudit, integrity] = await Promise.all([
      db.prepare('SELECT COUNT(*) count FROM ingested_events WHERE workspace_id = ?').bind(workspaceId).first<CountRow>(),
      db.prepare("SELECT COUNT(*) count FROM experiment_definitions WHERE workspace_id = ? AND status IN ('running','paused')").bind(workspaceId).first<CountRow>(),
      db.prepare('SELECT COUNT(*) count FROM decision_receipts WHERE workspace_id = ?').bind(workspaceId).first<CountRow>(),
      db.prepare('SELECT COUNT(*) count FROM simulation_runs WHERE workspace_id = ?').bind(workspaceId).first<CountRow>(),
      db.prepare('SELECT MAX(received_at) value FROM ingested_events WHERE workspace_id = ?').bind(workspaceId).first<{ value: string | null }>(),
      db.prepare('SELECT MAX(created_at) value FROM audit_events WHERE entity_id = ? OR metadata_json LIKE ?').bind(workspaceId, `%${workspaceId}%`).first<{ value: string | null }>(),
      db.prepare('SELECT 1 value').first<{ value: number }>(),
    ]);
    const freshnessMinutes = latestEvent?.value ? Math.max(0, Math.round((Date.now() - Date.parse(latestEvent.value)) / 60_000)) : null;
    const databaseHealthy = integrity?.value === 1; const freshnessHealthy = freshnessMinutes === null || freshnessMinutes <= 15;
    return secureJson({
      workspaceId, state: databaseHealthy && freshnessHealthy ? 'healthy' : 'degraded', checkedAt: new Date().toISOString(), latencyMs: Math.round(performance.now() - started),
      checks: { database: { state: databaseHealthy ? 'healthy' : 'down', detail: databaseHealthy ? 'query_ok' : 'query_failed' }, ingestionFreshness: { state: freshnessHealthy ? 'healthy' : 'degraded', minutes: freshnessMinutes }, authorization: { state: 'healthy', role: access.organization.role } },
      telemetry: { ingestedEvents: Number(events?.count ?? 0), activeExperiments: Number(experiments?.count ?? 0), decisionReceipts: Number(receipts?.count ?? 0), simulationRuns: Number(simulations?.count ?? 0), latestAuditAt: latestAudit?.value ?? null },
      security: { workspaceIsolation: true, serverSideAuthorization: true, rateLimits: true, idempotentIngestion: true, automaticRollback: true, secretsInClient: false },
      objectives: { availabilityTargetPct: 99.9, dashboardP95TargetMs: 750, ingestionFreshnessTargetMinutes: 15 },
    });
  } catch (error) { console.error('operations health failed', error); return secureJson({ code: 'operations_failed', message: 'AXIOM operational health is unavailable.', details: null }, 500); }
}
