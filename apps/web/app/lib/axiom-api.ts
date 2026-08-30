/**
 * AXIOM API client.
 *
 * Ek hi jagah se saari HTTP calls jaati hain. Components `fetch` directly
 * call nahi karte — isse base URL, error handling aur headers har jagah
 * consistent rehte hain, aur Day 4 pe auth token add karna ek-line change
 * hoga (10 components mein nahi).
 */

import type {
  ActiveExperiment,
  ApiErrorDetail,
  DashboardResponse,
  WorkspaceSummary,
} from './axiom-contract';
import { firebaseAuthorizationHeader } from './firebase-client';

/**
 * Base URL environment se aati hai, hardcode nahi.
 *
 * `NEXT_PUBLIC_` prefix zaroori hai — Next.js sirf isi prefix wale variables
 * browser bundle mein bhejta hai. Yeh safety feature hai: server-side secrets
 * (database password, API keys) galti se client pe leak nahi hote.
 */
const CONFIGURED_API_BASE_URL = process.env.NEXT_PUBLIC_AXIOM_API_URL?.trim();
const API_BASE_URL = (CONFIGURED_API_BASE_URL || '').replace(/\/$/, '');

/** Backend ka `ErrorDetail` envelope carry karne wala error. */
export class AxiomApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | null;

  constructor(status: number, detail: ApiErrorDetail) {
    super(detail.message);
    this.name = 'AxiomApiError';
    this.status = status;
    this.code = detail.code;
    this.details = detail.details;
  }
}

/** API reachable hi nahi hai (server band hai / network down). */
export class AxiomNetworkError extends Error {
  constructor(url: string, cause: unknown) {
    super(`AXIOM API reachable nahi hai (${url || 'same-origin'}).`);
    this.name = 'AxiomNetworkError';
    this.cause = cause;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const authHeaders = await firebaseAuthorizationHeader();

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...authHeaders, ...init?.headers },
      // Dashboard data hamesha fresh chahiye — stale cache pe "kal ke numbers"
      // dikhana analytics product mein bug hai, optimisation nahi.
      cache: 'no-store',
    });
  } catch (cause) {
    // `fetch` sirf network-level failure pe throw karta hai. 404/500 pe woh
    // resolve hota hai, isliye woh case neeche handle hota hai.
    throw new AxiomNetworkError(url, cause);
  }

  if (!response.ok) {
    let detail: ApiErrorDetail = {
      code: `http_${response.status}`,
      message: response.statusText || 'Request failed',
      details: null,
    };
    try {
      detail = (await response.json()) as ApiErrorDetail;
    } catch {
      // Body JSON nahi thi (proxy ka HTML error page, etc.) — default rakho.
    }
    throw new AxiomApiError(response.status, detail);
  }

  return (await response.json()) as T;
}

export function listWorkspaces(): Promise<WorkspaceSummary[]> {
  return request<WorkspaceSummary[]>('/api/v1/workspaces');
}

export function getDashboard(
  workspaceId: string,
  operatorEmail?: string,
): Promise<DashboardResponse> {
  return request<DashboardResponse>(`/api/v1/workspaces/${workspaceId}/dashboard`, {
    // ⚠️ Yeh header **authentication nahi** hai — sirf demo personalisation hai
    // aur trivially spoofable hai. Real JWT auth Day 4 pe aayega. Backend ke
    // `app/api/deps.py` mein bhi yeh saaf likha hai.
    headers: operatorEmail ? { 'X-Axiom-User-Email': operatorEmail } : undefined,
  });
}

/**
 * Overview screen ka poora data.
 *
 * Workspace id **hardcode nahi** karte. Pehle list karte hain, phir pehla
 * workspace use karte hain — isse seed dobara chalane pe (nayi UUIDs) frontend
 * apne aap kaam karta rehta hai.
 */
export async function loadOverview(operatorEmail?: string, workspaceId?: string): Promise<DashboardResponse> {
  // Day 3: hosted app apni same-origin Worker API + D1 use karti hai. Optional
  // external URL sirf legacy FastAPI development ke liye supported hai.
  if (!CONFIGURED_API_BASE_URL) {
    const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
    return request<DashboardResponse>(`/api/v1/dashboard${query}`);
  }

  const workspaces = await listWorkspaces();
  if (workspaces.length === 0) {
    throw new Error(
      'Koi workspace nahi mila. Demo data seed karein:  cd apps/api && python -m scripts.seed',
    );
  }
  return getDashboard(workspaces[0].id, operatorEmail);
}

export function selectWorkspace(workspaceId: string): Promise<DashboardResponse> {
  return request<DashboardResponse>('/api/v1/dashboard', {
    method: 'POST',
    body: JSON.stringify({ action: 'select_workspace', workspaceId }),
  });
}

export function approveRecommendation(recommendationId: string): Promise<DashboardResponse> {
  return request<DashboardResponse>('/api/v1/dashboard', {
    method: 'POST',
    body: JSON.stringify({ action: 'approve_recommendation', recommendationId }),
  });
}

export function controlExperiment(workspaceId: string, experimentId: string, action: 'pause' | 'resume' | 'rollback'): Promise<{ experimentId: string; status: ActiveExperiment['status']; flagEnabled: boolean }> {
  return request('/api/v1/experiments', {
    method: 'POST',
    body: JSON.stringify({ action, workspaceId, experimentId }),
  });
}

export { API_BASE_URL };
