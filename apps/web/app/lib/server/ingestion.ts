import { getDatabase } from '../../../db';

export type IngestionSummary = {
  totalEvents: number;
  uniqueUsers: number;
  lastEventAt: string | null;
  sources: Array<{
    source: string;
    status: 'connected' | 'idle';
    eventCount: number;
    lastEventAt: string | null;
  }>;
};

type SummaryRow = {
  total_events: number;
  unique_users: number;
  last_event_at: string | null;
};

type SourceRow = {
  source: string;
  status: string;
  event_count: number;
  last_event_at: string | null;
};

export async function loadIngestionSummary(workspaceId: string): Promise<IngestionSummary> {
  const db = getDatabase();
  const [summary, sourceResult] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS total_events,
        COUNT(DISTINCT anonymous_id) AS unique_users,
        MAX(received_at) AS last_event_at
      FROM ingested_events WHERE workspace_id = ?`)
      .bind(workspaceId).first<SummaryRow>(),
    db.prepare(`SELECT source, status, event_count, last_event_at
      FROM source_connections WHERE workspace_id = ? ORDER BY source`)
      .bind(workspaceId).all<SourceRow>(),
  ]);

  return {
    totalEvents: Number(summary?.total_events ?? 0),
    uniqueUsers: Number(summary?.unique_users ?? 0),
    lastEventAt: summary?.last_event_at ?? null,
    sources: (sourceResult.results ?? []).map((row) => ({
      source: row.source,
      status: row.status === 'connected' ? 'connected' : 'idle',
      eventCount: Number(row.event_count),
      lastEventAt: row.last_event_at,
    })),
  };
}
