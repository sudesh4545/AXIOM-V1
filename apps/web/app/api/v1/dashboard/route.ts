import { ensureDatabase, getDatabase } from '../../../../db';
import type { DashboardResponse, DecisionReceiptSummary } from '../../../lib/axiom-contract';
import { createBundledDemoOverview } from '../../../lib/demo-overview';

export const dynamic = 'force-dynamic';

type RequestIdentity = {
  userId: string;
  email: string;
  displayName: string;
  authenticated: boolean;
};

type SnapshotRow = {
  payload_json: string;
  revision: number;
  updated_at: string;
};

function decodeFullName(request: Request): string | null {
  const encoding = request.headers.get('oai-authenticated-user-full-name-encoding');
  const encoded = request.headers.get('oai-authenticated-user-full-name');
  if (!encoded || encoding !== 'percent-encoded-utf-8') return null;
  try { return decodeURIComponent(encoded); } catch { return null; }
}

function requestIdentity(request: Request): RequestIdentity | null {
  const userId = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email');
  if (userId && email) {
    return {
      userId,
      email,
      displayName: decodeFullName(request) ?? email.split('@')[0],
      authenticated: true,
    };
  }

  const hostname = new URL(request.url).hostname;
  if (['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    return { userId: 'local-development-user', email: 'local@axiom.dev', displayName: 'Sudesh', authenticated: false };
  }
  return null;
}

function firstName(identity: RequestIdentity): string {
  return identity.displayName.trim().split(/\s+/)[0] || identity.email.split('@')[0] || 'there';
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function upsertUser(identity: RequestIdentity, now: string): Promise<void> {
  await getDatabase().prepare(`INSERT INTO axiom_users (id, email, display_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = excluded.updated_at`)
    .bind(identity.userId, identity.email.toLowerCase(), identity.displayName, now, now).run();
}

async function readOrCreateSnapshot(identity: RequestIdentity): Promise<SnapshotRow> {
  const db = getDatabase();
  const existing = await db.prepare('SELECT payload_json, revision, updated_at FROM dashboard_snapshots WHERE user_id = ?')
    .bind(identity.userId).first<SnapshotRow>();
  if (existing) return existing;

  const now = new Date().toISOString();
  const payload = createBundledDemoOverview();
  payload.operatorFirstName = firstName(identity);
  payload.dataSourceNote = 'Persistent AXIOM demo workspace. Connect a product data source to replace seed metrics with measured results.';
  await db.prepare(`INSERT INTO dashboard_snapshots (user_id, payload_json, revision, created_at, updated_at)
    VALUES (?, ?, 1, ?, ?)`)
    .bind(identity.userId, JSON.stringify(payload), now, now).run();
  return { payload_json: JSON.stringify(payload), revision: 1, updated_at: now };
}

function attachRuntimeState(row: SnapshotRow, identity: RequestIdentity): DashboardResponse {
  const payload = JSON.parse(row.payload_json) as DashboardResponse;
  payload.operatorFirstName = firstName(identity);
  payload.session = identity;
  payload.storage = { state: 'connected', revision: row.revision, lastSavedAt: row.updated_at };
  payload.systemStatus = { state: 'healthy', label: 'Live', message: 'API and database connected' };
  return payload;
}

async function loadDashboard(request: Request): Promise<{ identity: RequestIdentity; row: SnapshotRow; payload: DashboardResponse } | Response> {
  const identity = requestIdentity(request);
  if (!identity) return json({ code: 'authentication_required', message: 'Sign in with ChatGPT to open AXIOM.', details: null }, 401);

  await ensureDatabase();
  const now = new Date().toISOString();
  await upsertUser(identity, now);
  const row = await readOrCreateSnapshot(identity);
  return { identity, row, payload: attachRuntimeState(row, identity) };
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

    const body = await request.json().catch(() => null) as { action?: string; recommendationId?: string } | null;
    if (body?.action !== 'approve_recommendation' || body.recommendationId !== loaded.payload.recommendation.id) {
      return json({ code: 'invalid_action', message: 'This dashboard action is not supported.', details: null }, 400);
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
    const persistedPayload = { ...loaded.payload, session: undefined, storage: undefined };
    if (!alreadyApproved) {
      const db = getDatabase();
      await db.batch([
        db.prepare('UPDATE dashboard_snapshots SET payload_json = ?, revision = ?, updated_at = ? WHERE user_id = ?')
          .bind(JSON.stringify(persistedPayload), nextRevision, savedAt, loaded.identity.userId),
        db.prepare(`INSERT INTO audit_events (id, user_id, action, entity_type, entity_id, metadata_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(crypto.randomUUID(), loaded.identity.userId, 'approve_recommendation', 'recommendation', recommendation.id, JSON.stringify({ trafficPct: recommendation.trafficPct }), savedAt),
      ]);
    }

    const responseRow = { payload_json: JSON.stringify(persistedPayload), revision: nextRevision, updated_at: alreadyApproved ? loaded.row.updated_at : savedAt };
    return json(attachRuntimeState(responseRow, loaded.identity));
  } catch (error) {
    console.error('AXIOM dashboard write failed', error);
    return json({ code: 'dashboard_write_failed', message: 'AXIOM could not save this approval.', details: null }, 500);
  }
}
