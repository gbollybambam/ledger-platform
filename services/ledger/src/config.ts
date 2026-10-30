export type AppEnv = 'development' | 'test' | 'production';

export interface Config {
  appEnv: AppEnv;
  host: string;
  port: number;
  databaseUrl: string;
}

export class ConfigError extends Error {
  constructor(problems: string[]) {
    super(`Invalid configuration:\n- ${problems.join('\n- ')}`);
    this.name = 'ConfigError';
  }
}

const APP_ENVS: readonly AppEnv[] = ['development', 'test', 'production'];

/**
 * Reads and checks environment variables. It collects every problem
 * and reports them all at once, so one run shows everything to fix.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const problems: string[] = [];

  const rawAppEnv = env.APP_ENV ?? 'development';
  if (!APP_ENVS.includes(rawAppEnv as AppEnv)) {
    problems.push(`APP_ENV must be one of: ${APP_ENVS.join(', ')}`);
  }

  const rawPort = env.APP_PORT ?? '3000';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || port < 1 || port > 65535) {
    problems.push('APP_PORT must be a whole number from 1 to 65535');
  }

  const databaseUrl = env.DATABASE_URL ?? '';
  if (databaseUrl === '') {
    problems.push('DATABASE_URL is required');
  }

  if (problems.length > 0) {
    throw new ConfigError(problems);
  }

  return {
    appEnv: rawAppEnv as AppEnv,
    // Listen on this machine only by default. Containers can set APP_HOST=0.0.0.0.
    host: env.APP_HOST ?? '127.0.0.1',
    port,
    databaseUrl,
  };
}
