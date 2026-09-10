import { describe, expect, it } from 'vitest';
import { parseCsv, prepareCsvEvents } from './csv-import';

describe('company CSV import', () => {
  it('preserves quoted commas, escaped quotes, newlines and BOMs', () => {
    expect(parseCsv('\uFEFFname,note\r\n"Acme, Inc","said ""hi""\nnext"\r\n')).toEqual([['name', 'note'], ['Acme, Inc', 'said "hi"\nnext']]);
  });
  it('does not silently truncate files after 100 rows', async () => {
    const csv = 'event_name,user_id\n' + Array.from({ length: 250 }, (_, i) => `user_signed_up,u${i}`).join('\n');
    expect(await prepareCsvEvents(csv)).toHaveLength(250);
  });
  it('produces the same retry keys across attempts and unique keys for each row', async () => {
    const csv = 'event_name,user_id\nuser_signed_up,u1\nactivation_completed,u1';
    const first = await prepareCsvEvents(csv, new Date('2026-09-10T00:00:00Z'));
    const retry = await prepareCsvEvents(csv, new Date('2026-09-11T00:00:00Z'));
    expect(first.map((event) => event.idempotencyKey)).toEqual(retry.map((event) => event.idempotencyKey));
    expect(new Set(first.map((event) => event.idempotencyKey)).size).toBe(2);
  });
  it('rejects missing identities, malformed CSV and invalid revenue before upload', async () => {
    await expect(prepareCsvEvents('event_name\nuser_signed_up')).rejects.toThrow('user_id');
    expect(() => parseCsv('a,b\n"unfinished,b')).toThrow('closing quote');
    await expect(prepareCsvEvents('event_name,user_id,monthly_amount_inr\nsubscription_started,u1,NaN')).rejects.toThrow('Row 2');
    await expect(prepareCsvEvents('event_name,user_id\nuser_signed_up,')).rejects.toThrow('Row 2');
  });
  it('infers custom product events and rejects excess or mismatched rows', async () => {
    expect((await prepareCsvEvents('event_name,user_id\nreport_exported,u1'))[0].eventType).toBe('product');
    await expect(prepareCsvEvents('event_name,user_id\nuser_signed_up,u1,extra')).rejects.toThrow('Column count');
    await expect(prepareCsvEvents('event_name,user_id\n' + 'user_signed_up,u1\n'.repeat(5001))).rejects.toThrow('5,000');
  });
});
