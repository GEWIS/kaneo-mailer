import { describe, expect, it } from 'vitest';
import { extractDueDate, parseMessage } from '../src/message';
import { rawMail } from './helpers';

describe('extractDueDate', () => {
  it('parses dd-mm-yyyy hh:mm in local time', () => {
    expect(extractDueDate('Borrel 24-12-2026 18:30')).toBe(new Date(2026, 11, 24, 18, 30).toISOString());
  });

  it('returns null without a timestamp', () => {
    expect(extractDueDate('Order new chairs')).toBeNull();
    expect(extractDueDate('Meeting 24-12-2026')).toBeNull();
  });

  it('rejects impossible dates', () => {
    expect(extractDueDate('31-02-2026 10:00')).toBeNull();
    expect(extractDueDate('01-01-2026 25:00')).toBeNull();
  });
});

describe('parseMessage', () => {
  it('reads the Kaneo headers case-insensitively', async () => {
    const mail = await parseMessage(
      rawMail({ headers: { 'X-KANEO-PROJECT-ID': ' abc123 ', 'x-kaneo-column': 'In Progress' } }),
    );
    expect(mail.projectId).toBe('abc123');
    expect(mail.column).toBe('In Progress');
  });

  it('returns null for missing or empty headers', async () => {
    const mail = await parseMessage(rawMail({ headers: { 'X-Kaneo-Column': '' } }));
    expect(mail.projectId).toBeNull();
    expect(mail.column).toBeNull();
  });

  it('uses the subject as title and the text body as description', async () => {
    const mail = await parseMessage(rawMail({ subject: 'Borrel 24-12-2026 18:30', body: 'Bring snacks.\r\n' }));
    expect(mail.title).toBe('Borrel 24-12-2026 18:30');
    expect(mail.description).toBe('Bring snacks.');
    expect(mail.dueDate).toBe(new Date(2026, 11, 24, 18, 30).toISOString());
  });

  it('decodes encoded bodies and subjects', async () => {
    const raw = [
      'Subject: =?utf-8?B?Q2Fmw6kgdmlzaXQ=?=',
      'X-Kaneo-Project-Id: p1',
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from('Caf\u00e9 at 12:00').toString('base64'),
    ].join('\r\n');
    const mail = await parseMessage(raw);
    expect(mail.title).toBe('Caf\u00e9 visit');
    expect(mail.description).toBe('Caf\u00e9 at 12:00');
  });

  it('uses the text part of a multipart message', async () => {
    const raw = [
      'Subject: Multipart',
      'MIME-Version: 1.0',
      'Content-Type: multipart/alternative; boundary="b"',
      '',
      '--b',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Plain text',
      '--b',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<p>HTML</p>',
      '--b--',
    ].join('\r\n');
    expect((await parseMessage(raw)).description).toBe('Plain text');
  });

  it('falls back to a placeholder title', async () => {
    expect((await parseMessage(rawMail({ subject: '' }))).title).toBe('(no subject)');
  });
});
