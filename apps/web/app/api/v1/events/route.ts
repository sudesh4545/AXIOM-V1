import { ensureDatabase, getDatabase } from '../../../../db';
import { loadIngestionSummary } from '../../../lib/server/ingestion';
import { EVENT_TAXONOMY_VERSION, validateTaxonomy, type AxiomEventType, type EventProperties } from '../../../lib/server/event-taxonomy';
import { requestIdentity, type RequestIdentity } from '../../../lib/server/request-identity';
import { resolveWorkspaceAccess, type WorkspaceAccess } from '../../../lib/server/workspace-access';
import { enforceRateLimit, secureJson } from '../../../lib/server/http-security';

export const dynamic = 'force-dynamic';

const supportedSources = new Set(['axiom_sdk', 'webhook']);

type EventInput = {
  idempotencyKey?: unknown;
  eventType?: unknown;
  eventName?: unknown;
  anonymousId?: unknown;
  properties?: unknown;
  occurredAt?: unknown;
};

type EventBatch = {
  workspaceId?: unknown;
  source?: unknown;
  events?: unknown;
};

function json(body: unknown, status = 200): Response {
  return secureJson(body, status);
}

function cleanText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maxLength) {
    throw new Error(`${field} must be between 1 and ${maxLength} characters.`);
  }
  return value.trim();
}

function cleanOptionalText(value: unknown, field: string, maxLength: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  return cleanText(value, field, maxLength);
}

function cleanOccurredAt(value: unknown): string {
  if (value === undefined || value === null || value === '') return new Date().toISOString();
  const parsed = new Date(cleanText(value, 'occurredAt', 40));
  if (Number.isNaN(parsed.getTime())) throw new Error('occurredAt must be a valid ISO date.');
  const now = Date.now();
  if (parsed.getTime() > now + 5 * 60_000) throw new Error('occurredAt must not be more than five minutes in the future.');
  if (parsed.getTime() < now - 2 * 365 * 86_400_000) throw new Error('occurredAt must be within the last two years.');
  return parsed.toISOString();
}

function cleanProperties(value: unknown): EventProperties {
  const properties = value === undefined ? {} : value;
  if (properties === null || typeof properties !== 'object' || Array.isArray(properties)) {
    throw new Error('properties must be a JSON object.');
  }
  const encoded = JSON.stringify(properties);
  if (encoded.length > 16_000) throw new Error('properties must be smaller than 16 KB.');
  return properties as EventProperties;
}

async function upsertUser(identity: RequestIdentity, now: string): Promise<void> {
  await getDatabase().prepare(`INSERT INTO axiom_users (id, email, display_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = excluded.updated_at`)
    .bind(identity.userId, identity.email.toLowerCase(), identity.displayName, now, now).run();
}

async function authorize(request: Request, workspaceId: string): Promise<
  | { ok: true; identity: RequestIdentity; access: WorkspaceAccess }
  | { ok: false; response: Response }
> {
  const identity = await requestIdentity(request);
  if (!identity) return { ok: false, response: json({ code: 'authentication_required', message: 'Sign in to ingest AXIOM events.', details: null }, 401) };
  await ensureDatabase();
  await upsertUser(identity, new Date().toISOString());
  const access = await resolveWorkspaceAccess(identity, workspaceId);
  if (access.active.id !== workspaceId) {
    return { ok: false, response: json({ code: 'workspace_forbidden', message: 'That workspace is not available to this account.', details: null }, 403) };
  }
  return { ok: true, identity, access };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const workspaceId = new URL(request.url).searchParams.get('workspaceId');
    if (!workspaceId) return json({ code: 'workspace_required', message: 'workspaceId is required.', details: null }, 400);
    const authorized = await authorize(request, workspaceId);
    if (!authorized.ok) return authorized.response;
    return json(await loadIngestionSummary(authorized.access.active.id));
  } catch (error) {
    console.error('AXIOM event summary failed', error);
    return json({ code: 'event_summary_failed', message: 'AXIOM could not load source telemetry.', details: null }, 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => null) as EventBatch | null;
    if (!body) return json({ code: 'invalid_json', message: 'A JSON event batch is required.', details: null }, 400);

    const workspaceId = cleanText(body.workspaceId, 'workspaceId', 120);
    const source = body.source === undefined ? 'axiom_sdk' : cleanText(body.source, 'source', 40).toLowerCase();
    if (!supportedSources.has(source)) {
      return json({ code: 'unsupported_source', message: 'source must be axiom_sdk or webhook.', details: null }, 400);
    }
    if (!Array.isArray(body.events) || body.events.length === 0 || body.events.length > 100) {
      return json({ code: 'invalid_batch', message: 'events must contain between 1 and 100 items.', details: null }, 400);
    }

    const events = (body.events as EventInput[]).map((event) => {
      const eventType = cleanText(event.eventType, 'eventType', 80).toLowerCase() as AxiomEventType;
      const eventName = cleanText(event.eventName, 'eventName', 120).toLowerCase();
      const anonymousId = cleanOptionalText(event.anonymousId, 'anonymousId', 120);
      const properties = cleanProperties(event.properties);
      validateTaxonomy({ eventType, eventName, anonymousId, properties });
      return {
        id: crypto.randomUUID(),
        idempotencyKey: cleanText(event.idempotencyKey, 'idempotencyKey', 120),
        eventType,
        eventName,
        anonymousId,
        propertiesJson: JSON.stringify(properties),
        occurredAt: cleanOccurredAt(event.occurredAt),
      };
    });

    const authorized = await authorize(request, workspaceId);
    if (!authorized.ok) return authorized.response;
    const limited = await enforceRateLimit(request, 'events:ingest', 300, 60); if (limited) return limited;
    const now = new Date().toISOString();
    const db = getDatabase();
    const results = await db.batch(events.map((event) => db.prepare(`INSERT INTO ingested_events
      (id, workspace_id, user_id, source, idempotency_key, event_type, event_name, anonymous_id, properties_json, occurred_at, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, idempotency_key) DO NOTHING`)
      .bind(event.id, workspaceId, authorized.identity.userId, source, event.idempotencyKey, event.eventType, event.eventName, event.anonymousId, event.propertiesJson, event.occurredAt, now)));
    const inserted = results.reduce((total, result) => total + Number(result.meta.changes ?? 0), 0);

    if (inserted > 0) {
      await db.batch([
        db.prepare(`INSERT INTO source_connections (workspace_id, source, status, event_count, last_event_at, updated_at)
          VALUES (?, ?, 'connected', ?, ?, ?)
          ON CONFLICT(workspace_id, source) DO UPDATE SET
            status = 'connected', event_count = event_count + excluded.event_count,
            last_event_at = excluded.last_event_at, updated_at = excluded.updated_at`)
          .bind(workspaceId, source, inserted, now, now),
        db.prepare(`INSERT INTO audit_events (id, user_id, action, entity_type, entity_id, metadata_json, created_at)
          VALUES (?, ?, 'ingest_event_batch', 'workspace', ?, ?, ?)`)
          .bind(crypto.randomUUID(), authorized.identity.userId, workspaceId, JSON.stringify({ source, received: events.length, inserted }), now),
      ]);
    }

    return json({
      accepted: events.length,
      inserted,
      duplicates: events.length - inserted,
      workspaceId,
      source,
      taxonomyVersion: EVENT_TAXONOMY_VERSION,
      summary: await loadIngestionSummary(workspaceId),
    }, 202);
  } catch (error) {
    if (error instanceof Error && /must|required|requires|between|valid|smaller|lowercase|snake_case|one of/.test(error.message)) {
      return json({ code: 'invalid_event', message: error.message, details: null }, 400);
    }
    console.error('AXIOM event ingestion failed', error);
    return json({ code: 'event_ingestion_failed', message: 'AXIOM could not ingest this batch.', details: null }, 500);
  }
}
