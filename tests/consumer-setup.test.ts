import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';

const render = fileURLToPath(new URL('../docs/skills/llm-gateway-consumer-setup/scripts/render-update.mjs', import.meta.url));
let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'consumer-workflow-'));
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({
    dependencies: { '@krdn/llm-gateway': '^5.0.0' },
    packageManager: 'pnpm@10.28.2',
  }));
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

function generate() {
  return spawnSync(process.execPath, [render, '24'], { cwd, encoding: 'utf8' });
}

it('uses the declared manager for both install and update, and limits the PR to its files', () => {
  writeFileSync(join(cwd, 'pnpm-lock.yaml'), '');
  const output = generate();
  expect(output.status).toBe(0);
  expect(output.stdout).toContain('corepack pnpm install --frozen-lockfile');
  expect(output.stdout).toContain('corepack pnpm update @krdn/llm-gateway');
  expect(output.stdout).toMatch(/add-paths: \|\s+package\.json\s+pnpm-lock\.yaml/);
});

it('produces no workflow for missing, conflicting or ambiguous lockfiles', () => {
  for (const lock of [undefined, 'package-lock.json', 'pnpm-lock.yaml']) {
    if (lock) writeFileSync(join(cwd, lock), '');
    const output = generate();
    expect(output.status).not.toBe(0);
    expect(output.stdout).toBe('');
  }
});

it.each([
  ['npm', 'package-lock.json', undefined, 'npm ci', 'npm update'],
  ['yarn', 'yarn.lock', '1.22.22', 'yarn@1.22.22 install --frozen-lockfile', 'yarn@1.22.22 upgrade'],
  ['yarn', 'yarn.lock', '4.10.3', 'yarn@4.10.3 install --immutable', 'yarn@4.10.3 up -R'],
] as const)('uses the %s lockfile when packageManager is absent (%s, %s)', (manager, lock, version, install, update) => {
  expect(spawnSync('git', ['init', '-q'], { cwd }).status).toBe(0);
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ dependencies: { '@krdn/llm-gateway': '^5.0.0' } }));
  writeFileSync(join(cwd, lock), '');
  const output = spawnSync(process.execPath, [render, '24', ...(version ? [version] : [])], { cwd, encoding: 'utf8' });
  expect(output.status).toBe(0);
  expect(output.stdout).toContain(install);
  expect(output.stdout).toContain(update + ' @krdn/llm-gateway');
  if (manager === 'yarn') expect(output.stdout).toContain('export COREPACK_ENABLE_AUTO_PIN=0');
});
