import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('uses safe defaults', () => {
    const config = loadConfig({ DATABASE_URL: 'postgres://x' });
    expect(config).toEqual({
      appEnv: 'development',
      host: '127.0.0.1',
      port: 3000,
      databaseUrl: 'postgres://x',
    });
  });

  it('reads every setting', () => {
    const config = loadConfig({
      APP_ENV: 'production',
      APP_HOST: '0.0.0.0',
      APP_PORT: '8080',
      DATABASE_URL: 'postgres://y',
    });
    expect(config).toEqual({
      appEnv: 'production',
      host: '0.0.0.0',
      port: 8080,
      databaseUrl: 'postgres://y',
    });
  });

  it('requires DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({})).toThrow(/DATABASE_URL is required/);
  });

  it('rejects a bad port and a bad APP_ENV, and reports both', () => {
    const run = () =>
      loadConfig({ DATABASE_URL: 'postgres://x', APP_PORT: '99999', APP_ENV: 'staging' });
    expect(run).toThrow(/APP_PORT/);
    expect(run).toThrow(/APP_ENV/);
  });

  it.each(['abc', '12.5', '-1', '0', ''])('rejects the port %j', (port) => {
    expect(() => loadConfig({ DATABASE_URL: 'postgres://x', APP_PORT: port })).toThrow(/APP_PORT/);
  });
});
