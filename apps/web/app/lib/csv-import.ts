import { FUNNEL_EVENT_NAMES, REVENUE_EVENT_NAMES, SYSTEM_EVENT_NAMES, validateTaxonomy, type AxiomEventType } from './server/event-taxonomy';

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;
export const IMPORT_BATCH_SIZE = 100;

// Quoted commas, escaped quotes, BOMs and embedded newlines are valid CSV.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
      else if (quoted || !cell.trim()) quoted = !quoted;
      else throw new Error(`Invalid quote near CSV row ${rows.length + 1}.`);
    } else if (!quoted && (char === ',' || char === '\n' || char === '\r')) {
      row.push(cell.trim()); cell = '';
      if (char !== ',') {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (char === '\r' && input[i + 1] === '\n') i++;
      }
    } else cell += char;
  }
  if (quoted) throw new Error('A quoted CSV value is missing its closing quote.');
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export async function prepareCsvEvents(text: string, now = new Date()) {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new Error('Choose a CSV smaller than 2 MB.');
  const rows = parseCsv(text);
  const headers = (rows.shift() ?? []).map((header) => header.toLowerCase());
  if (!headers.includes('event_name') && !headers.includes('event')) throw new Error('CSV needs an event_name column.');
  if (!headers.includes('anonymous_id') && !headers.includes('user_id')) throw new Error('CSV needs an anonymous_id or user_id column.');
  if (!rows.length) throw new Error('CSV needs at least one data row.');
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`Import up to ${MAX_IMPORT_ROWS.toLocaleString()} rows per file. Split this file and try again.`);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')))), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return rows.map((row, index) => {
    const get = (key: string) => row[headers.indexOf(key)] ?? '';
    const eventName = get('event_name') || get('event');
    const eventType = (get('event_type') || (REVENUE_EVENT_NAMES.includes(eventName as never) ? 'revenue' : FUNNEL_EVENT_NAMES.includes(eventName as never) ? 'lifecycle' : SYSTEM_EVENT_NAMES.includes(eventName as never) ? 'system' : 'product')) as AxiomEventType;
    const amount = get('monthly_amount_inr') || get('amount_inr');
    const event = {
      idempotencyKey: get('idempotency_key') || `csv-${hash}-${index}`,
      eventType, eventName,
      anonymousId: get('anonymous_id') || get('user_id') || null,
      occurredAt: get('occurred_at') || now.toISOString(),
      properties: amount ? { monthlyAmountInr: Number(amount) } : {},
    };
    try {
      if (row.length !== headers.length) throw new Error('Column count does not match the header.');
      validateTaxonomy(event);
      const timestamp = Date.parse(event.occurredAt);
      if (!Number.isFinite(timestamp)) throw new Error('occurred_at must be a valid date and time.');
      if (timestamp > now.getTime() + 5 * 60 * 1000) throw new Error('occurred_at cannot be in the future.');
      event.occurredAt = new Date(timestamp).toISOString();
    } catch (error) { throw new Error(`Row ${index + 2}: ${error instanceof Error ? error.message : 'Invalid event.'}`); }
    return event;
  });
}
