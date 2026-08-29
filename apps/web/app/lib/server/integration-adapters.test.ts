import { describe, expect, it } from 'vitest';
import { adaptPostHog, adaptStripe } from './integration-adapters';

describe('integration adapters', () => {
  it('maps governed PostHog lifecycle events', () => {
    const [event] = adaptPostHog([{ uuid:'p1', event:'activation_completed', distinct_id:'u1', timestamp:'2026-08-29T00:00:00Z', properties:{ plan:'pro' } }]);
    expect(event).toMatchObject({ idempotencyKey:'p1', eventType:'lifecycle', eventName:'activation_completed', anonymousId:'u1' });
  });
  it('normalizes custom PostHog product events', () => expect(adaptPostHog([{ uuid:'p2', event:'Dashboard Opened', distinct_id:'u2' }])[0].eventName).toBe('dashboard_opened'));
  it('maps Stripe subscriptions and converts minor INR units', () => {
    const [event] = adaptStripe({ id:'evt_1', type:'customer.subscription.created', created:1787961600, data:{ object:{ customer:'cus_1', currency:'inr', plan:{ amount:250000 } } } });
    expect(event).toMatchObject({ eventType:'revenue', eventName:'subscription_started', anonymousId:'cus_1', properties:{ monthlyAmountInr:2500 } });
  });
  it('rejects unsupported Stripe types and currencies', () => {
    expect(() => adaptStripe({ id:'e', type:'charge.refunded', data:{ object:{ customer:'c' } } })).toThrow(/not supported/);
    expect(() => adaptStripe({ id:'e', type:'invoice.paid', data:{ object:{ customer:'c', currency:'usd' } } })).toThrow(/INR/);
  });
});
