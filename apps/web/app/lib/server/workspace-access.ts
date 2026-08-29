import { getDatabase } from '../../../db';
import type { WorkspaceSummary } from '../axiom-contract';
import type { RequestIdentity } from './request-identity';

type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  environment: WorkspaceSummary['environment'];
  objective: string | null;
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  role: 'owner' | 'admin' | 'analyst' | 'viewer';
};

export type WorkspaceAccess = {
  active: WorkspaceSummary;
  available: WorkspaceSummary[];
  organization: {
    id: string;
    name: string;
    slug: string;
    role: WorkspaceRow['role'];
  };
};

const workspaceQuery = `SELECT
  w.id, w.name, w.slug, w.environment, w.objective,
  o.id AS organization_id, o.name AS organization_name, o.slug AS organization_slug,
  m.role
FROM workspaces w
JOIN organizations o ON o.id = w.organization_id
JOIN organization_memberships m ON m.organization_id = o.id
WHERE m.user_id = ?
ORDER BY CASE w.environment WHEN 'production' THEN 0 WHEN 'staging' THEN 1 ELSE 2 END, w.created_at`;

function summary(row: WorkspaceRow): WorkspaceSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    environment: row.environment,
    organizationName: row.organization_name,
    objective: row.objective,
  };
}

async function seedDefaultOrganization(identity: RequestIdentity, now: string): Promise<void> {
  const db = getDatabase();
  const organizationId = crypto.randomUUID();
  const productionId = crypto.randomUUID();
  const sandboxId = crypto.randomUUID();
  const organizationSlug = `acme-${organizationId.slice(0, 8)}`;

  await db.batch([
    db.prepare(`INSERT INTO organizations (id, name, slug, owner_user_id, created_at, updated_at)
      VALUES (?, 'Acme Labs', ?, ?, ?, ?)`)
      .bind(organizationId, organizationSlug, identity.userId, now, now),
    db.prepare(`INSERT INTO organization_memberships (organization_id, user_id, role, created_at)
      VALUES (?, ?, 'owner', ?)`)
      .bind(organizationId, identity.userId, now),
    db.prepare(`INSERT INTO workspaces (id, organization_id, name, slug, environment, objective, created_at, updated_at)
      VALUES (?, ?, 'Acme Cloud', 'acme-cloud', 'production', 'Increase paid conversion without increasing churn.', ?, ?)`)
      .bind(productionId, organizationId, now, now),
    db.prepare(`INSERT INTO workspaces (id, organization_id, name, slug, environment, objective, created_at, updated_at)
      VALUES (?, ?, 'Acme Sandbox', 'acme-sandbox', 'sandbox', 'Safely validate experiments before production traffic.', ?, ?)`)
      .bind(sandboxId, organizationId, now, now),
    db.prepare(`INSERT INTO user_workspace_preferences (user_id, active_workspace_id, updated_at)
      VALUES (?, ?, ?)`)
      .bind(identity.userId, productionId, now),
  ]);
}

export async function resolveWorkspaceAccess(
  identity: RequestIdentity,
  requestedWorkspaceId?: string | null,
): Promise<WorkspaceAccess> {
  const db = getDatabase();
  let rows = (await db.prepare(workspaceQuery).bind(identity.userId).all<WorkspaceRow>()).results;
  if (rows.length === 0) {
    await seedDefaultOrganization(identity, new Date().toISOString());
    rows = (await db.prepare(workspaceQuery).bind(identity.userId).all<WorkspaceRow>()).results;
  }

  if (rows.length === 0) throw new Error('AXIOM could not create the default workspace.');
  const preference = await db.prepare('SELECT active_workspace_id FROM user_workspace_preferences WHERE user_id = ?')
    .bind(identity.userId).first<{ active_workspace_id: string }>();
  const activeRow = rows.find((row) => row.id === requestedWorkspaceId)
    ?? rows.find((row) => row.id === preference?.active_workspace_id)
    ?? rows[0];

  return {
    active: summary(activeRow),
    available: rows.map(summary),
    organization: {
      id: activeRow.organization_id,
      name: activeRow.organization_name,
      slug: activeRow.organization_slug,
      role: activeRow.role,
    },
  };
}

export async function selectWorkspace(identity: RequestIdentity, workspaceId: string): Promise<WorkspaceAccess | null> {
  const access = await resolveWorkspaceAccess(identity, workspaceId);
  if (access.active.id !== workspaceId) return null;
  const now = new Date().toISOString();
  await getDatabase().prepare(`INSERT INTO user_workspace_preferences (user_id, active_workspace_id, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET active_workspace_id = excluded.active_workspace_id, updated_at = excluded.updated_at`)
    .bind(identity.userId, workspaceId, now).run();
  return access;
}
