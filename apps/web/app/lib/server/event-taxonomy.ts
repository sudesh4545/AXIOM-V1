export const EVENT_TYPES = ['lifecycle', 'product', 'revenue', 'system'] as const;
export const EVENT_TAXONOMY_VERSION = '1.0';
export type AxiomEventType = typeof EVENT_TYPES[number];

export const FUNNEL_EVENT_NAMES = [
  'user_signed_up',
  'trial_started',
  'activation_completed',
  'teammate_invited',
] as const;

export const REVENUE_EVENT_NAMES = [
  'subscription_started',
  'subscription_cancelled',
  'revenue_recorded',
] as const;

export const SYSTEM_EVENT_NAMES = ['day5_ingestion_verified', 'source_connected'] as const;

export const RECOGNIZED_EVENT_NAMES = new Set<string>([
  ...FUNNEL_EVENT_NAMES,
  ...REVENUE_EVENT_NAMES,
  ...SYSTEM_EVENT_NAMES,
]);

export type EventProperties = Record<string, unknown>;

export type ValidatedEventShape = {
  eventType: AxiomEventType;
  eventName: string;
  anonymousId: string | null;
  properties: EventProperties;
};

function finiteMoney(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1_000_000_000;
}

export function validateTaxonomy(input: ValidatedEventShape): void {
  if (!EVENT_TYPES.includes(input.eventType)) {
    throw new Error(`eventType must be one of: ${EVENT_TYPES.join(', ')}.`);
  }

  if (input.eventType !== 'system' && !input.anonymousId) {
    throw new Error('anonymousId is required for lifecycle, product and revenue events.');
  }

  if (input.eventType === 'lifecycle' && !FUNNEL_EVENT_NAMES.includes(input.eventName as typeof FUNNEL_EVENT_NAMES[number])) {
    throw new Error(`lifecycle eventName must be one of: ${FUNNEL_EVENT_NAMES.join(', ')}.`);
  }

  if (input.eventType === 'revenue' && !REVENUE_EVENT_NAMES.includes(input.eventName as typeof REVENUE_EVENT_NAMES[number])) {
    throw new Error(`revenue eventName must be one of: ${REVENUE_EVENT_NAMES.join(', ')}.`);
  }

  if (input.eventType === 'system' && !SYSTEM_EVENT_NAMES.includes(input.eventName as typeof SYSTEM_EVENT_NAMES[number])) {
    throw new Error(`system eventName must be one of: ${SYSTEM_EVENT_NAMES.join(', ')}.`);
  }

  if (input.eventType === 'product' && !/^[a-z][a-z0-9_]{1,79}$/.test(input.eventName)) {
    throw new Error('product eventName must use lowercase snake_case.');
  }

  if (input.eventName === 'subscription_started' || input.eventName === 'revenue_recorded') {
    const amount = input.properties.monthlyAmountInr ?? input.properties.amountInr;
    if (!finiteMoney(amount)) {
      throw new Error(`${input.eventName} requires a non-negative monthlyAmountInr or amountInr number.`);
    }
  }
}

export function isBusinessEvent(eventType: string, eventName: string): boolean {
  if (eventType === 'system') return false;
  return eventType === 'product'
    || FUNNEL_EVENT_NAMES.includes(eventName as typeof FUNNEL_EVENT_NAMES[number])
    || REVENUE_EVENT_NAMES.includes(eventName as typeof REVENUE_EVENT_NAMES[number]);
}
