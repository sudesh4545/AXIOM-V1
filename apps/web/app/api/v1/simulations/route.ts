import { ensureDatabase, getDatabase } from '../../../../db';
import { enforceRateLimit, secureJson } from '../../../lib/server/http-security';
import { requestIdentity } from '../../../lib/server/request-identity';
import { runShadowSimulation, type SimulationInput, type SimulationScenario } from '../../../lib/server/shadow-simulation';
import { resolveWorkspaceAccess } from '../../../lib/server/workspace-access';

async function authorize(request: Request, workspaceId: string) {
  const identity = requestIdentity(request);
  if (!identity) return secureJson({ code: 'authentication_required', message: 'Sign in to run simulations.', details: null }, 401);
  await ensureDatabase();
  const access = await resolveWorkspaceAccess(identity, workspaceId);
  if (access.active.id !== workspaceId) return secureJson({ code: 'workspace_forbidden', message: 'That workspace is not available.', details: null }, 403);
  return { identity, role: access.organization.role };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const workspaceId = new URL(request.url).searchParams.get('workspaceId') ?? '';
    if (!workspaceId) return secureJson({ code: 'workspace_required', message: 'workspaceId is required.', details: null }, 400);
    const authorized = await authorize(request, workspaceId); if (authorized instanceof Response) return authorized;
    const rows = await getDatabase().prepare(`SELECT id, recommendation_id, scenario, input_json, result_json, created_at
      FROM simulation_runs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 10`).bind(workspaceId).all<Record<string, string>>();
    return secureJson({ workspaceId, runs: rows.results.map((row) => ({ id: row.id, recommendationId: row.recommendation_id, scenario: row.scenario, input: JSON.parse(row.input_json), result: JSON.parse(row.result_json), createdAt: row.created_at })) });
  } catch (error) { console.error('simulation history failed', error); return secureJson({ code: 'simulation_history_failed', message: 'AXIOM could not load simulation history.', details: null }, 500); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => null) as Partial<SimulationInput> & { workspaceId?: unknown; recommendationId?: unknown } | null;
    const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId.trim() : '';
    const recommendationId = typeof body?.recommendationId === 'string' ? body.recommendationId.trim() : '';
    if (!workspaceId || !recommendationId) return secureJson({ code: 'parameters_required', message: 'workspaceId and recommendationId are required.', details: null }, 400);
    const authorized = await authorize(request, workspaceId); if (authorized instanceof Response) return authorized;
    if (!['owner', 'admin', 'analyst'].includes(authorized.role)) return secureJson({ code: 'insufficient_role', message: 'Viewer access cannot create simulations.', details: null }, 403);
    const limited = await enforceRateLimit(request, 'simulations:create', 20, 60); if (limited) return limited;
    const snapshot = await getDatabase().prepare('SELECT payload_json FROM workspace_dashboard_snapshots WHERE user_id = ? AND workspace_id = ?')
      .bind(authorized.identity.userId, workspaceId).first<{ payload_json: string }>();
    const currentRecommendationId = snapshot ? (JSON.parse(snapshot.payload_json) as { recommendation?: { id?: string } }).recommendation?.id : null;
    if (currentRecommendationId !== recommendationId) return secureJson({ code: 'recommendation_not_found', message: 'Only the current workspace recommendation can be simulated.', details: null }, 409);
    const input: SimulationInput = {
      baseConversionPct: Number(body?.baseConversionPct), predictedUpliftPct: Number(body?.predictedUpliftPct), trafficPct: Number(body?.trafficPct),
      durationDays: Number(body?.durationDays), dailyEligibleUsers: Number(body?.dailyEligibleUsers), baselineGuardrailPct: Number(body?.baselineGuardrailPct),
      scenario: body?.scenario as SimulationScenario, iterations: Number(body?.iterations ?? 3000), seed: typeof body?.seed === 'string' && body.seed ? body.seed : `${workspaceId}:${recommendationId}:${body?.scenario ?? 'base'}`,
    };
    const result = runShadowSimulation(input); const id = crypto.randomUUID(); const now = new Date().toISOString();
    await getDatabase().batch([
      getDatabase().prepare(`INSERT INTO simulation_runs (id, workspace_id, recommendation_id, scenario, input_json, result_json, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, workspaceId, recommendationId, input.scenario, JSON.stringify(input), JSON.stringify(result), authorized.identity.userId, now),
      getDatabase().prepare(`INSERT INTO audit_events (id, user_id, action, entity_type, entity_id, metadata_json, created_at) VALUES (?, ?, 'run_shadow_simulation', 'simulation', ?, ?, ?)`)
        .bind(crypto.randomUUID(), authorized.identity.userId, id, JSON.stringify({ workspaceId, recommendationId, scenario: input.scenario, recommendation: result.recommendation }), now),
    ]);
    return secureJson({ id, workspaceId, recommendationId, scenario: input.scenario, result, createdAt: now }, 201);
  } catch (error) {
    if (error instanceof Error && error.message.includes('must be')) return secureJson({ code: 'invalid_simulation', message: error.message, details: null }, 400);
    console.error('simulation failed', error); return secureJson({ code: 'simulation_failed', message: 'AXIOM could not run this simulation.', details: null }, 500);
  }
}
