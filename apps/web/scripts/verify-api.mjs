import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = process.env.AXIOM_TEST_URL ?? 'http://localhost:3000';
const results = [];

async function request(path, init = {}, expected = 200) {
  const response = await fetch(`${base}${path}`, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...init.headers } });
  let body = null;
  const text = await response.text();
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  assert.equal(response.status, expected, `${path}: expected ${expected}, received ${response.status}: ${text.slice(0, 300)}`);
  return body;
}

function pass(name) { results.push(name); }

const original = await request('/api/v1/dashboard');
assert.equal(original.systemStatus.state, 'healthy');
assert.equal(original.workspaceContext.availableWorkspaces.length, 2);
pass('dashboard health and workspace catalog');

const production = original.workspaceContext.availableWorkspaces.find((workspace) => workspace.environment === 'production');
const sandbox = original.workspaceContext.availableWorkspaces.find((workspace) => workspace.environment === 'sandbox');
assert.ok(production && sandbox);

const productionView = original.workspace.environment === 'production'
  ? original
  : await request('/api/v1/dashboard', { method: 'POST', body: JSON.stringify({ action: 'select_workspace', workspaceId: production.id }) });
const blockedLaunch = await request('/api/v1/dashboard', { method:'POST', body:JSON.stringify({action:'approve_recommendation', recommendationId:productionView.recommendation.id, workspaceId:production.id}) }, 409);
assert.equal(blockedLaunch.code, 'risk_policy_blocked');
pass('pre-launch risk policy blocks demo-only production evidence');

await request('/api/v1/dashboard', { method: 'POST', body: JSON.stringify({ action: 'select_workspace', workspaceId: sandbox.id }) });
const measured = await request(`/api/v1/dashboard?workspaceId=${sandbox.id}`);
assert.equal(measured.measurement.state, 'measured');
assert.equal(measured.dataSource, 'ingested');
assert.equal(measured.opportunities.length, 3);
assert.deepEqual(measured.opportunities.map((item) => item.rank), [1, 2, 3]);
pass('measured dashboard and ranked opportunities');

const securityResponse = await fetch(`${base}/api/v1/dashboard`, { cache: 'no-store' });
assert.equal(securityResponse.headers.get('x-content-type-options'), 'nosniff');
assert.equal(securityResponse.headers.get('x-frame-options'), 'DENY');
pass('site-wide anti-sniff and anti-frame security headers');

const shadowRun = await request('/api/v1/simulations', { method: 'POST', body: JSON.stringify({
  workspaceId: sandbox.id, recommendationId: measured.recommendation.id, baseConversionPct: 12.9,
  predictedUpliftPct: measured.recommendation.predictedUpliftPct, trafficPct: measured.recommendation.trafficPct,
  durationDays: measured.recommendation.durationDays, dailyEligibleUsers: 500, baselineGuardrailPct: 3.2,
  scenario: 'base', iterations: 1000, seed: 'day-30-verification',
}) }, 201);
assert.equal(shadowRun.result.expectedExposedUsers, 350);
assert.equal(shadowRun.result.assumptions.some((item) => item.includes('does not create causal evidence')), true);
const simulationHistory = await request(`/api/v1/simulations?workspaceId=${sandbox.id}`);
assert.equal(simulationHistory.runs.some((run) => run.id === shadowRun.id), true);
const rejectedSimulation = await request('/api/v1/simulations', { method: 'POST', body: JSON.stringify({
  workspaceId: sandbox.id, recommendationId: 'foreign-recommendation', baseConversionPct: 12.9,
  predictedUpliftPct: 7.2, trafficPct: 10, durationDays: 7, dailyEligibleUsers: 500,
  baselineGuardrailPct: 3.2, scenario: 'base', iterations: 1000,
}) }, 409);
assert.equal(rejectedSimulation.code, 'recommendation_not_found');
pass('persisted CompanyGym-lite shadow simulation');

await request('/api/v1/events', { method: 'POST', body: JSON.stringify({ workspaceId: sandbox.id, source: 'axiom_sdk', events: [{
  idempotencyKey: `operations-heartbeat-${randomUUID()}`, eventType: 'system', eventName: 'day5_ingestion_verified',
  anonymousId: `operations-${randomUUID()}`, properties: { suite: 'final-closure' }, occurredAt: new Date().toISOString(),
}] }) }, 202);
const operations = await request(`/api/v1/operations?workspaceId=${sandbox.id}`);
assert.equal(operations.state, 'healthy'); assert.equal(operations.checks.database.state, 'healthy');
assert.equal(operations.security.rateLimits, true); assert.ok(operations.telemetry.simulationRuns >= 1);
pass('operational health, SLO targets and security posture');

await request(`/api/v1/dashboard?workspaceId=${randomUUID()}`, {}, 403);
await request('/api/v1/events', {}, 400);
await request(`/api/v1/events?workspaceId=${randomUUID()}`, {}, 403);
pass('workspace isolation and required parameters');

const postEvents = (body, expected = 202) => request('/api/v1/events', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }, expected);
await postEvents('{broken', 400);
await postEvents({ workspaceId: sandbox.id, events: [] }, 400);
await postEvents({ workspaceId: sandbox.id, events: Array.from({ length: 101 }, () => ({})) }, 400);
await postEvents({ workspaceId: sandbox.id, source: 'magic', events: [{}] }, 400);
pass('batch and JSON boundaries');

const valid = {
  workspaceId: sandbox.id, source: 'axiom_sdk', events: [{
    idempotencyKey: `verification-${randomUUID()}`, eventType: 'product', eventName: 'verification_completed',
    anonymousId: `verification-${randomUUID()}`, properties: { suite: 'day-1-17' }, occurredAt: new Date().toISOString(),
  }],
};
const inserted = await postEvents(valid);
assert.equal(inserted.inserted, 1);
const duplicate = await postEvents(valid);
assert.equal(duplicate.inserted, 0);
assert.equal(duplicate.duplicates, 1);
pass('idempotent event ingestion');

const adapterDelivery = `adapter-${randomUUID()}`;
const posthog = await request('/api/v1/adapters', { method: 'POST', body: JSON.stringify({ workspaceId: sandbox.id, provider: 'posthog', deliveryId: adapterDelivery, payload: [{ uuid: `ph-${randomUUID()}`, event: 'Dashboard Opened', distinct_id: `adapter-user-${randomUUID()}`, timestamp: new Date().toISOString() }] }) }, 202);
assert.equal(posthog.accepted, 1);
const posthogReplay = await request('/api/v1/adapters', { method: 'POST', body: JSON.stringify({ workspaceId: sandbox.id, provider: 'posthog', deliveryId: adapterDelivery, payload: [{ uuid: 'ignored', event: 'ignored', distinct_id: 'ignored' }] }) }, 202);
assert.equal(posthogReplay.replayed, true);
const stripe = await request('/api/v1/adapters', { method: 'POST', body: JSON.stringify({ workspaceId: sandbox.id, provider: 'stripe', deliveryId: `stripe-${randomUUID()}`, payload: { id: `evt-${randomUUID()}`, type: 'invoice.paid', created: Math.floor(Date.now() / 1000), data: { object: { customer: `stripe-customer-${randomUUID()}`, currency: 'inr', amount_paid: 125000 } } } }) }, 202);
assert.equal(stripe.accepted, 1);
pass('PostHog and Stripe adapter normalization/replay');

const invalidBase = { workspaceId: sandbox.id, source: 'axiom_sdk' };
await postEvents({ ...invalidBase, events: [{ idempotencyKey: 'x', eventType: 'product', eventName: 'Bad Name', anonymousId: 'u' }] }, 400);
await postEvents({ ...invalidBase, events: [{ idempotencyKey: 'x', eventType: 'lifecycle', eventName: 'user_signed_up' }] }, 400);
await postEvents({ ...invalidBase, events: [{ idempotencyKey: 'x', eventType: 'revenue', eventName: 'subscription_started', anonymousId: 'u', properties: {} }] }, 400);
await postEvents({ ...invalidBase, events: [{ idempotencyKey: 'x', eventType: 'product', eventName: 'future_event', anonymousId: 'u', occurredAt: new Date(Date.now() + 10 * 60_000).toISOString() }] }, 400);
await postEvents({ ...invalidBase, events: [{ idempotencyKey: 'x', eventType: 'product', eventName: 'old_event', anonymousId: 'u', occurredAt: new Date(Date.now() - 3 * 365 * 86_400_000).toISOString() }] }, 400);
await postEvents({ ...invalidBase, events: [{ idempotencyKey: 'x', eventType: 'product', eventName: 'large_event', anonymousId: 'u', properties: { value: 'x'.repeat(17_000) } }] }, 400);
pass('taxonomy, actor, money, time and payload validation');

const experimentId = `approved-${measured.recommendation.id}`;
const flagKey = `axiom.${measured.recommendation.id.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '')}`;
const primaryMetric = measured.recommendation.focusMetric.toLowerCase().replace(/[^a-z0-9]+/g, '_');
const policy = await request(`/api/v1/policies?workspaceId=${sandbox.id}`);
assert.equal(policy.autoRollback, true);
await request('/api/v1/policies', { method: 'POST', body: JSON.stringify({ workspaceId: sandbox.id, ...policy, minSubjectsPerVariant: 5 }) }, 400);
const savedPolicy = await request('/api/v1/policies', { method: 'POST', body: JSON.stringify({ workspaceId: sandbox.id, ...policy }) });
assert.equal(savedPolicy.confidenceThresholdPct, policy.confidenceThresholdPct);
pass('workspace risk-policy validation and persistence');

const approvedExperiment = measured.experiments.find((item) => item.id === experimentId);
if (approvedExperiment?.status === 'running') {
  let assignment;
  for (let index = 0; index < 200; index += 1) {
    const candidate = await request(`/api/v1/experiments?workspaceId=${sandbox.id}&flagKey=${encodeURIComponent(flagKey)}&subjectId=suite-${index}`);
    if (candidate.assignedVariant === 'treatment') { assignment = candidate; break; }
  }
  assert.ok(assignment, 'a 10% treatment assignment should appear within 200 deterministic subjects');
  const exposureBody = { action: 'record_exposure', workspaceId: sandbox.id, experimentId, subjectId: assignment.subjectId, variant: assignment.assignedVariant, idempotencyKey: `exposure-${randomUUID()}` };
  const exposure = await request('/api/v1/experiments', { method: 'POST', body: JSON.stringify(exposureBody) }, 202);
  assert.equal(exposure.inserted, 1);
  const repeatedExposure = await request('/api/v1/experiments', { method: 'POST', body: JSON.stringify(exposureBody) }, 202);
  assert.equal(repeatedExposure.duplicate, true);
  await request('/api/v1/experiments', { method: 'POST', body: JSON.stringify({ ...exposureBody, idempotencyKey: `bad-${randomUUID()}`, variant: 'control' }) }, 409);
  pass('sticky assignment and exposure deduplication');

  await request('/api/v1/experiments', { method: 'POST', body: JSON.stringify({ action: 'record_outcome', workspaceId: sandbox.id, experimentId, subjectId: assignment.subjectId, variant: assignment.assignedVariant, metricKey: 'wrong_metric', converted: true, guardrailBreached: false, idempotencyKey: `wrong-${randomUUID()}` }) }, 409);
  const outcome = await request('/api/v1/experiments', { method: 'POST', body: JSON.stringify({ action: 'record_outcome', workspaceId: sandbox.id, experimentId, subjectId: assignment.subjectId, variant: assignment.assignedVariant, metricKey: primaryMetric, converted: true, guardrailBreached: false, idempotencyKey: `outcome-${randomUUID()}` }) }, 202);
  assert.equal(outcome.analysis.decision, 'insufficient_data');
  pass('outcome tracking and conservative causal-analysis boundary');

  await request('/api/v1/experiments', { method: 'POST', body: JSON.stringify({ action: 'pause', workspaceId: sandbox.id, experimentId }) });
  const paused = await request(`/api/v1/experiments?workspaceId=${sandbox.id}&flagKey=${encodeURIComponent(flagKey)}&subjectId=${assignment.subjectId}`);
  assert.equal(paused.enabled, false); assert.equal(paused.variant, 'control');
  await request('/api/v1/experiments', { method: 'POST', body: JSON.stringify({ action: 'resume', workspaceId: sandbox.id, experimentId }) });
  const resumed = await request(`/api/v1/experiments?workspaceId=${sandbox.id}&flagKey=${encodeURIComponent(flagKey)}&subjectId=${assignment.subjectId}`);
  assert.equal(resumed.enabled, true); assert.equal(resumed.variant, assignment.assignedVariant);
  pass('pause/resume kill switch and sticky recovery');

  await request('/api/v1/policies', { method: 'POST', body: JSON.stringify({ workspaceId: sandbox.id, ...policy, minSubjectsPerVariant: 10, maxGuardrailIncreasePct: 3, autoRollback: true }) });
  const cohorts = { control: [], treatment: [] };
  const prefix = randomUUID();
  for (let index = 0; index < 500 && (cohorts.control.length < 10 || cohorts.treatment.length < 9); index += 1) {
    const candidate = await request(`/api/v1/experiments?workspaceId=${sandbox.id}&flagKey=${encodeURIComponent(flagKey)}&subjectId=guardrail-${prefix}-${index}`);
    if (candidate.assignedVariant === 'control' ? cohorts.control.length >= 10 : cohorts.treatment.length >= 9) continue;
    await request('/api/v1/experiments', { method: 'POST', body: JSON.stringify({ action:'record_exposure', workspaceId:sandbox.id, experimentId, subjectId:candidate.subjectId, variant:candidate.assignedVariant, idempotencyKey:`guardrail-exposure-${prefix}-${index}` }) }, 202);
    cohorts[candidate.assignedVariant].push(candidate);
  }
  assert.equal(cohorts.control.length, 10); assert.equal(cohorts.treatment.length, 9);
  for (const variant of ['control','treatment']) for (let index=0; index<cohorts[variant].length; index+=1) {
    const candidate=cohorts[variant][index];
    await request('/api/v1/experiments', { method:'POST', body:JSON.stringify({ action:'record_outcome', workspaceId:sandbox.id, experimentId, subjectId:candidate.subjectId, variant, metricKey:primaryMetric, converted:index<5, guardrailBreached:variant==='treatment'&&index<5, idempotencyKey:`guardrail-outcome-${prefix}-${variant}-${index}` }) }, 202);
  }
  const safetyAnalysis = await request(`/api/v1/analysis?workspaceId=${sandbox.id}&experimentId=${experimentId}`);
  assert.equal(safetyAnalysis.analysis.decision, 'guardrail_rollback'); assert.equal(safetyAnalysis.status, 'rolled_back'); assert.ok(safetyAnalysis.receipt);
  await request('/api/v1/policies', { method:'POST', body:JSON.stringify({workspaceId:sandbox.id,...policy}) });
  pass('automatic guardrail rollback and complete Decision Receipt');
} else {
  const safetyAnalysis = await request(`/api/v1/analysis?workspaceId=${sandbox.id}&experimentId=${experimentId}`);
  assert.equal(safetyAnalysis.status, 'rolled_back'); assert.equal(safetyAnalysis.analysis.decision, 'guardrail_rollback'); assert.ok(safetyAnalysis.receipt);
  pass('persisted automatic rollback and Decision Receipt');
}

const started = performance.now();
const loadResponses = await Promise.all(Array.from({ length: 50 }, () => fetch(`${base}/api/v1/dashboard`, { cache: 'no-store' })));
assert.equal(loadResponses.filter((response) => response.status === 200).length, 50);
pass(`50-request concurrent smoke (${Math.round(performance.now() - started)} ms)`);

const restored = await request('/api/v1/dashboard', { method: 'POST', body: JSON.stringify({ action: 'select_workspace', workspaceId: production.id }) });
assert.equal(restored.workspace.environment, 'production');
pass('active workspace restored to production');

console.log(`AXIOM API verification passed (${results.length} groups):`);
for (const result of results) console.log(`  ✓ ${result}`);
