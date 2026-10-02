import { describe, expect, it, vi } from 'vitest';
import { KaneoError, type KaneoClient } from '../src/kaneo';
import { folders, runOnce, type MailClient } from '../src/mailbox';
import { Processor } from '../src/processor';
import { rawMail, silentLogger } from './helpers';

function fakeImap(messages: { uid: number; source?: string }[]) {
  const release = vi.fn();
  const client = {
    mailbox: { exists: messages.length },
    connect: vi.fn(() => Promise.resolve()),
    logout: vi.fn(() => Promise.resolve()),
    getMailboxLock: vi.fn(() => Promise.resolve({ path: 'API/IN', release })),
    fetchAll: vi.fn(() =>
      Promise.resolve(messages.map((m) => ({ uid: m.uid, source: m.source ? Buffer.from(m.source) : undefined }))),
    ),
    messageMove: vi.fn(() => Promise.resolve(false as const)),
  };
  return { client, release, imap: client as unknown as MailClient };
}

function processor(createTask: () => Promise<unknown> = () => Promise.resolve({ id: 't1' })) {
  const kaneo = {
    getColumns: () => Promise.resolve([{ id: 'c1', projectId: 'p1', name: 'Mail', slug: 'mail', position: 0 }]),
    createTask: vi.fn(createTask),
  } as unknown as KaneoClient;
  return new Processor(kaneo);
}

describe('folders', () => {
  it('builds path segments under the root', () => {
    expect(folders('API')).toEqual({ inbox: ['API', 'IN'], accepted: ['API', 'OUT'], rejected: ['API', 'REJECTED'] });
  });
});

describe('runOnce', () => {
  it('moves accepted mail to OUT and rejected mail to REJECTED', async () => {
    const { client, imap, release } = fakeImap([
      { uid: 1, source: rawMail({ headers: { 'X-Kaneo-Project-Id': 'p1' } }) },
      { uid: 2, source: rawMail() },
    ]);

    const summary = await runOnce(imap, processor(), 'API', silentLogger);

    expect(summary).toEqual({ accepted: 1, rejected: 1, retried: 0 });
    expect(client.getMailboxLock).toHaveBeenCalledWith(['API', 'IN']);
    expect(client.messageMove).toHaveBeenCalledWith('1', ['API', 'OUT'], { uid: true });
    expect(client.messageMove).toHaveBeenCalledWith('2', ['API', 'REJECTED'], { uid: true });
    expect(release).toHaveBeenCalled();
    expect(client.logout).toHaveBeenCalled();
  });

  it('leaves mail in IN on temporary Kaneo errors', async () => {
    const { client, imap } = fakeImap([{ uid: 1, source: rawMail({ headers: { 'X-Kaneo-Project-Id': 'p1' } }) }]);
    const failing = processor(() => Promise.reject(new KaneoError('down', 503)));

    expect(await runOnce(imap, failing, 'API', silentLogger)).toEqual({ accepted: 0, rejected: 0, retried: 1 });
    expect(client.messageMove).not.toHaveBeenCalled();
  });

  it('leaves mail in IN when the server sends no source', async () => {
    const { client, imap } = fakeImap([{ uid: 1 }]);
    expect(await runOnce(imap, processor(), 'API', silentLogger)).toMatchObject({ retried: 1 });
    expect(client.messageMove).not.toHaveBeenCalled();
  });

  it('skips fetching when IN is empty', async () => {
    const { client, imap, release } = fakeImap([]);
    expect(await runOnce(imap, processor(), 'API', silentLogger)).toEqual({ accepted: 0, rejected: 0, retried: 0 });
    expect(client.fetchAll).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalled();
  });

  it('releases the lock and logs out when processing throws', async () => {
    const { client, imap, release } = fakeImap([
      { uid: 1, source: rawMail({ headers: { 'X-Kaneo-Project-Id': 'p1' } }) },
    ]);
    const broken = processor(() => Promise.reject(new TypeError('boom')));

    await expect(runOnce(imap, broken, 'API', silentLogger)).rejects.toThrow('boom');
    expect(release).toHaveBeenCalled();
    expect(client.logout).toHaveBeenCalled();
  });
});
