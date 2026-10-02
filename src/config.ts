export interface Config {
  imap: {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
    root: string;
  };
  kaneo: {
    url: string;
    apiKey: string;
  };
  /** Seconds between polls; 0 means run once and exit. */
  pollInterval: number;
  logLevel: string;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new ConfigError(`${key} is required`);
  return value;
}

function integer(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new ConfigError(`${key} must be a non-negative integer`);
  return value;
}

function boolean(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (['true', '1', 'yes'].includes(raw)) return true;
  if (['false', '0', 'no'].includes(raw)) return false;
  throw new ConfigError(`${key} must be true or false`);
}

/**
 * Normalises a Kaneo base URL to the API root, so both `https://kaneo.example.com`
 * and `https://kaneo.example.com/api` work.
 */
export function apiBaseUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    imap: {
      host: required(env, 'IMAP_HOST'),
      port: integer(env, 'IMAP_PORT', 993),
      secure: boolean(env, 'IMAP_TLS', true),
      username: required(env, 'IMAP_USERNAME'),
      password: required(env, 'IMAP_PASSWORD'),
      root: env['IMAP_ROOT']?.trim() || 'API',
    },
    kaneo: {
      url: apiBaseUrl(required(env, 'KANEO_URL')),
      apiKey: required(env, 'KANEO_API_KEY'),
    },
    pollInterval: integer(env, 'POLL_INTERVAL', 300),
    logLevel: env['LOG_LEVEL']?.trim() || 'info',
  };
}
