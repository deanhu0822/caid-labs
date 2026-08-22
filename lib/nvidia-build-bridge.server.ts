import 'server-only';

import { spawn } from 'node:child_process';
import path from 'node:path';

type BridgeRequest = {
  action: 'status' | 'reason' | 'observe' | 'parse';
  payload: Record<string, unknown>;
};

export type NvidiaBuildBridgeResult = {
  ok: boolean;
  status?: string;
  endpoint?: string;
  keyPresent?: boolean;
  modelsListed?: boolean;
  modelCount?: number;
  probeSucceeded?: boolean;
  services?: Array<{
    capability: 'reasoning' | 'vision' | 'document-parse';
    configured: boolean;
    model: string;
    modelAvailable: boolean;
    adapterConnected: boolean;
    detail?: string;
  }>;
  model?: string;
  normalizationModel?: string;
  parsedText?: string;
  outputKind?: string;
  structured?: Record<string, unknown>;
  report?: unknown;
  error?: string;
};

function safeError(message: string) {
  const key = process.env.NVIDIA_API_KEY;
  return (key ? message.replaceAll(key, '[redacted]') : message).slice(0, 600);
}

export function runNvidiaBuildBridge(request: BridgeRequest): Promise<NvidiaBuildBridgeResult> {
  return new Promise((resolve) => {
    const python = process.env.FORMA_PYTHON_BIN || 'python';
    const pipelineDirectory = path.join(process.cwd(), 'product_pipeline');
    const child = spawn(/* turbopackIgnore: true */ python, ['nvidia_build_bridge.py'], {
      cwd: pipelineDirectory,
      env: process.env,
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result: NvidiaBuildBridgeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({ ok: false, error: 'NVIDIA Build bridge timed out.' });
    }, 120_000);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout = (stdout + chunk.toString('utf8')).slice(-2_000_000);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-16_000);
    });
    child.on('error', (error) => finish({ ok: false, error: safeError(error.message) }));
    child.stdin.on('error', (error) => finish({ ok: false, error: safeError(`Could not send the inference request to Python: ${error.message}`) }));
    child.on('close', () => {
      try {
        finish(JSON.parse(stdout) as NvidiaBuildBridgeResult);
      } catch {
        finish({ ok: false, error: safeError(stderr || 'NVIDIA Build bridge returned invalid JSON.') });
      }
    });
    child.stdin.end(JSON.stringify(request));
  });
}
