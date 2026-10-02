import { getLogger } from 'log4js';

export const silentLogger = (() => {
  const logger = getLogger('test');
  logger.level = 'off';
  return logger;
})();

/** Builds a raw RFC 822 message. */
export function rawMail(options: { subject?: string; headers?: Record<string, string>; body?: string } = {}): string {
  const lines = [
    'From: Board <board@example.com>',
    'To: kaneo@example.com',
    `Subject: ${options.subject ?? 'Order new chairs'}`,
    'Date: Fri, 02 Oct 2026 12:00:00 +0200',
    'Message-ID: <test@example.com>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    ...Object.entries(options.headers ?? {}).map(([key, value]) => `${key}: ${value}`),
    '',
    options.body ?? 'We need twenty new chairs.',
  ];
  return lines.join('\r\n');
}
