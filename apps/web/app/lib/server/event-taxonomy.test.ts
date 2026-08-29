import { describe, expect, it } from 'vitest';
import { isBusinessEvent, validateTaxonomy, type ValidatedEventShape } from './event-taxonomy';

function event(overrides: Partial<ValidatedEventShape> = {}): ValidatedEventShape {
  return {
    eventType: 'lifecycle',
    eventName: 'user_signed_up',
    anonymousId: 'user-1',
    properties: {},
    ...overrides,
  };
}

describe('event taxonomy', () => {
  it.each([
    event(),
    event({ eventType: 'product', eventName: 'dashboard_opened' }),
    event({ eventType: 'revenue', eventName: 'subscription_started', properties: { monthlyAmountInr: 2500 } }),
    event({ eventType: 'system', eventName: 'source_connected', anonymousId: null }),
  ])('accepts governed event %#', (input) => expect(() => validateTaxonomy(input)).not.toThrow());

  it('requires actor identity for every business event', () => {
    expect(() => validateTaxonomy(event({ anonymousId: null }))).toThrow(/anonymousId/);
  });

  it.each([
    event({ eventType: 'lifecycle', eventName: 'made_up_stage' }),
    event({ eventType: 'revenue', eventName: 'cash_magic' }),
    event({ eventType: 'system', eventName: 'unknown_system', anonymousId: null }),
  ])('rejects unknown governed name %#', (input) => expect(() => validateTaxonomy(input)).toThrow(/one of/));

  it.each(['Bad Name', '_leading', 'a', 'contains-dash'])('rejects invalid product name %s', (eventName) => {
    expect(() => validateTaxonomy(event({ eventType: 'product', eventName }))).toThrow(/snake_case/);
  });

  it.each([undefined, -1, Number.NaN, Number.POSITIVE_INFINITY, 1_000_000_001])('rejects invalid money %s', (amount) => {
    expect(() => validateTaxonomy(event({
      eventType: 'revenue',
      eventName: 'subscription_started',
      properties: { monthlyAmountInr: amount },
    }))).toThrow(/requires/);
  });

  it('keeps telemetry out of business measurements', () => {
    expect(isBusinessEvent('system', 'source_connected')).toBe(false);
    expect(isBusinessEvent('product', 'dashboard_opened')).toBe(true);
    expect(isBusinessEvent('lifecycle', 'user_signed_up')).toBe(true);
  });
});
