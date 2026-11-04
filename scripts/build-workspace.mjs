import { spawnSync } from 'node:child_process';
import { cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspace = resolve(root, 'workspace');
const output = resolve(root, 'public/_workspace');

function npm(args, env = process.env) {
  const result = spawnSync('npm', args, { cwd: workspace, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Workspace build failed (${result.status ?? result.signal}).`);
}

// The workspace has its own lockfile and must not be type-checked against the
// root app's dependencies. It is built with explicit browser-preview semantics.
npm(['ci', '--include=dev', '--no-audit', '--no-fund']);
npm(['run', 'build', '--', '--base=/_workspace/'], {
  ...process.env,
  VITE_CAID_HOSTED_PREVIEW: '1',
});
await rm(output, { recursive: true, force: true });
await cp(resolve(workspace, 'dist'), output, { recursive: true });
