import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(new URL('../node_modules/vinext/dist/cli.js', import.meta.url));
const child = spawn(process.execPath, [cliPath, 'dev'], { stdio: 'inherit' });

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
