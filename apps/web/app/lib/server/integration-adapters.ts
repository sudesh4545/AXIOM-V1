import type { AxiomEventType, EventProperties } from './event-taxonomy';

export type AdaptedEvent = { idempotencyKey: string; eventType: AxiomEventType; eventName: string; anonymousId: string; properties: EventProperties; occurredAt: string };

function iso(value: unknown): string {
  const date = typeof value === 'number' ? new Date(value > 10_000_000_000 ? value : value * 1000) : new Date(typeof value === 'string' ? value : Date.now());
  if (Number.isNaN(date.getTime())) throw new Error('Adapter event timestamp is invalid.');
  return date.toISOString();
}
function text(value: unknown, field: string): string { if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required.`); return value.trim(); }
function snake(value: string): string { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '').slice(0, 80); }

export function adaptPostHog(payload: unknown): AdaptedEvent[] {
  const events = Array.isArray(payload) ? payload : (payload && typeof payload === 'object' && Array.isArray((payload as { events?: unknown }).events) ? (payload as { events: unknown[] }).events : []);
  if (!events.length || events.length > 100) throw new Error('PostHog payload must contain 1 to 100 events.');
  const lifecycle: Record<string,string> = { user_signed_up:'user_signed_up', trial_started:'trial_started', activation_completed:'activation_completed', teammate_invited:'teammate_invited' };
  return events.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw new Error(`PostHog event ${index} is invalid.`);
    const item = raw as Record<string, unknown>; const properties = item.properties && typeof item.properties === 'object' ? item.properties as EventProperties : {};
    const original = text(item.event, 'PostHog event'); const eventName = lifecycle[original] ?? snake(original);
    if (eventName.length < 2) throw new Error('PostHog event name is invalid.');
    const anonymousId = text(item.distinct_id ?? properties.distinct_id, 'PostHog distinct_id');
    const idempotencyKey = text(item.uuid ?? properties.$insert_id ?? `posthog-${anonymousId}-${eventName}-${String(item.timestamp ?? index)}`, 'PostHog idempotency key');
    return { idempotencyKey, eventType: lifecycle[original] ? 'lifecycle' : 'product', eventName, anonymousId, properties, occurredAt: iso(item.timestamp) };
  });
}

export function adaptStripe(payload: unknown): AdaptedEvent[] {
  const events = Array.isArray(payload) ? payload : [payload];
  if (!events.length || events.length > 100) throw new Error('Stripe payload must contain 1 to 100 events.');
  return events.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new Error('Stripe event is invalid.');
    const item = raw as Record<string, unknown>; const type = text(item.type, 'Stripe type'); const data = item.data as { object?: Record<string, unknown> } | undefined; const object = data?.object ?? {};
    const customer = text(object.customer ?? object.customer_email, 'Stripe customer');
    const map: Record<string,string> = { 'customer.subscription.created':'subscription_started', 'customer.subscription.deleted':'subscription_cancelled', 'invoice.paid':'revenue_recorded' };
    const eventName = map[type]; if (!eventName) throw new Error(`Stripe event type ${type} is not supported.`);
    const currency = String(object.currency ?? 'inr').toLowerCase(); if (currency !== 'inr') throw new Error('Stripe V1 adapter supports INR events only.');
    const amountMinor = Number(object.amount_paid ?? object.amount_due ?? object.amount ?? (object.plan as Record<string,unknown> | undefined)?.amount ?? 0);
    const monthlyAmountInr = Math.max(0, Math.round(amountMinor / 100));
    const properties: EventProperties = eventName === 'subscription_cancelled' ? { stripeEventType:type } : { monthlyAmountInr, stripeEventType:type };
    return { idempotencyKey: text(item.id, 'Stripe event id'), eventType:'revenue', eventName, anonymousId:customer, properties, occurredAt:iso(item.created) };
  });
}
