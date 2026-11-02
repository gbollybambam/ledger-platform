import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface PackageJson {
  scripts?: Record<string, string>;
}

const packagePath = fileURLToPath(new URL('../package.json', import.meta.url));

async function readScripts(): Promise<Record<string, string>> {
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as PackageJson;
  expect(packageJson.scripts).toBeDefined();
  return packageJson.scripts ?? {};
}

describe('package scripts', () => {
  it('keeps client administration scripts exact and portable', async () => {
    const scripts = await readScripts();

    expect(scripts['client:create']).toBe('tsx scripts/client-admin-launcher.ts create');
    expect(scripts['client:revoke']).toBe('tsx scripts/client-admin-launcher.ts revoke');
    expect(scripts['client:list']).toBe('tsx scripts/client-admin-launcher.ts list');

    for (const [name, value] of Object.entries(scripts)) {
      expect(value, `${name} must not contain a Windows path`).not.toMatch(/[A-Za-z]:\\|\\/);
      if (value.includes('--env-file-if-exists')) {
        expect(value).toContain('--env-file-if-exists=');
        expect(value).not.toContain('--env-file-if-exists =');
      }
    }
  });
});
