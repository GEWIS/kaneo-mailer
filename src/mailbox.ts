import type { ImapFlow } from 'imapflow';
import type { Logger } from 'log4js';
import { parseMessage } from './message';
import type { Outcome, Processor } from './processor';

/** The subset of ImapFlow this module uses, so tests can supply a fake. */
export type MailClient = Pick<ImapFlow, 'connect' | 'logout' | 'getMailboxLock' | 'fetchAll' | 'messageMove'> & {
  mailbox: ImapFlow['mailbox'];
};

export interface Folders {
  inbox: string[];
  accepted: string[];
  rejected: string[];
}

/**
 * Folder paths are passed to ImapFlow as segments, so it joins them with the
 * server's own delimiter ("/" or ".").
 */
export function folders(root: string): Folders {
  return { inbox: [root, 'IN'], accepted: [root, 'OUT'], rejected: [root, 'REJECTED'] };
}

export interface RunSummary {
  accepted: number;
  rejected: number;
  retried: number;
}

/**
 * Turns every message in `<root>/IN` into a Kaneo task. Accepted mail moves to
 * `<root>/OUT`, rejected mail to `<root>/REJECTED`, and mail that hit a temporary
 * error stays in `IN` for the next run.
 */
export async function runOnce(
  client: MailClient,
  processor: Processor,
  root: string,
  logger: Logger,
): Promise<RunSummary> {
  const paths = folders(root);
  const summary: RunSummary = { accepted: 0, rejected: 0, retried: 0 };

  await client.connect();
  try {
    const lock = await client.getMailboxLock(paths.inbox);
    try {
      if (!client.mailbox || client.mailbox.exists === 0) {
        logger.debug('no mail in', paths.inbox.join('/'));
        return summary;
      }

      // Fetch everything first: no other IMAP command may run while a FETCH streams.
      const messages = await client.fetchAll('1:*', { uid: true, source: true });

      for (const message of messages) {
        const outcome = await handle(message.source, processor);
        const uid = String(message.uid);

        switch (outcome.state) {
          case 'accepted':
            logger.info(`uid ${uid}: created task ${outcome.taskId}`);
            await client.messageMove(uid, paths.accepted, { uid: true });
            summary.accepted++;
            break;
          case 'rejected':
            logger.warn(`uid ${uid}: rejected, ${outcome.reason}`);
            await client.messageMove(uid, paths.rejected, { uid: true });
            summary.rejected++;
            break;
          case 'retry':
            logger.error(`uid ${uid}: left in IN for retry, ${outcome.reason}`);
            summary.retried++;
            break;
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch((error: unknown) => logger.warn('logout failed', error));
  }

  return summary;
}

async function handle(source: Buffer | undefined, processor: Processor): Promise<Outcome> {
  if (!source) return { state: 'retry', reason: 'server returned no message source' };

  let mail;
  try {
    mail = await parseMessage(source);
  } catch (error) {
    return { state: 'rejected', reason: `unparseable message: ${(error as Error).message}` };
  }
  return processor.process(mail);
}
