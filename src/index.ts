import { setTimeout as sleep } from 'node:timers/promises';
import { ImapFlow } from 'imapflow';
import { configure, getLogger } from 'log4js';
import { loadConfig, type Config } from './config';
import { KaneoClient } from './kaneo';
import { runOnce } from './mailbox';
import { Processor } from './processor';

configure({
  appenders: { stdout: { type: 'stdout', layout: { type: 'pattern', pattern: '%d{ISO8601} %p %c %m' } } },
  categories: { default: { appenders: ['stdout'], level: 'info' } },
});

const logger = getLogger('kaneo-mailer');

function imapClient(config: Config): ImapFlow {
  // ImapFlow is chatty and its errors also surface as exceptions, so only show it when tracing.
  const imapLogger = getLogger('imap');
  imapLogger.level = config.logLevel === 'trace' ? 'trace' : 'off';

  return new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.secure,
    auth: { user: config.imap.username, pass: config.imap.password },
    logger: imapLogger,
  });
}

/** Returns false when the run failed outright, e.g. IMAP was unreachable. */
async function poll(config: Config, kaneo: KaneoClient): Promise<boolean> {
  try {
    // ImapFlow connections cannot be reused after logout, so every run gets a fresh one.
    const summary = await runOnce(imapClient(config), new Processor(kaneo), config.imap.root, logger);
    const handled = summary.accepted + summary.rejected + summary.retried;
    logger.log(
      handled > 0 ? 'info' : 'debug',
      `run finished: ${summary.accepted} accepted, ${summary.rejected} rejected, ${summary.retried} retried`,
    );
    return true;
  } catch (error) {
    logger.error('run failed', error);
    return false;
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  logger.level = config.logLevel;
  const kaneo = new KaneoClient(config.kaneo.url, config.kaneo.apiKey);

  if (config.pollInterval === 0) {
    if (!(await poll(config, kaneo))) process.exitCode = 1;
    return;
  }

  const controller = new AbortController();
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      logger.info(`received ${signal}, stopping after the current run`);
      controller.abort();
    });
  }

  logger.info(`polling every ${config.pollInterval}s`);
  while (!controller.signal.aborted) {
    await poll(config, kaneo);
    await sleep(config.pollInterval * 1000, undefined, { signal: controller.signal }).catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  logger.fatal(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
