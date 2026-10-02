import { describe, expect, it } from 'vitest';
import { apiBaseUrl, ConfigError, loadConfig } from '../src/config';

const base = {
  IMAP_HOST: 'imap.example.com',
  IMAP_USERNAME: 'kaneo@example.com',
  IMAP_PASSWORD: 'secret',
  KANEO_URL: 'https://kaneo.example.com',
  KANEO_API_KEY: 'key',
};

describe('loadConfig', () => {
  it('applies defaults', () => {
    const config = loadConfig(base);
    expect(config.imap).toMatchObject({ port: 993, secure: true, root: 'API' });
    expect(config.kaneo.url).toBe('https://kaneo.example.com/api');
    expect(config.pollInterval).toBe(300);
    expect(config.logLevel).toBe('info');
  });

  it('reads overrides', () => {
    const config = loadConfig({ ...base, IMAP_PORT: '143', IMAP_TLS: 'false', IMAP_ROOT: 'Kaneo', POLL_INTERVAL: '0' });
    expect(config.imap).toMatchObject({ port: 143, secure: false, root: 'Kaneo' });
    expect(config.pollInterval).toBe(0);
  });

  it.each(['IMAP_HOST', 'IMAP_USERNAME', 'IMAP_PASSWORD', 'KANEO_URL', 'KANEO_API_KEY'])('requires %s', (key) => {
    expect(() => loadConfig({ ...base, [key]: ' ' })).toThrow(new ConfigError(`${key} is required`));
  });

  it('rejects malformed numbers and booleans', () => {
    expect(() => loadConfig({ ...base, IMAP_PORT: 'abc' })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, POLL_INTERVAL: '-5' })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, IMAP_TLS: 'maybe' })).toThrow(ConfigError);
  });
});

describe('apiBaseUrl', () => {
  it.each([
    ['https://kaneo.example.com', 'https://kaneo.example.com/api'],
    ['https://kaneo.example.com/', 'https://kaneo.example.com/api'],
    ['https://kaneo.example.com/api', 'https://kaneo.example.com/api'],
    ['https://kaneo.example.com/api/', 'https://kaneo.example.com/api'],
  ])('%s -> %s', (input, expected) => {
    expect(apiBaseUrl(input)).toBe(expected);
  });
});
