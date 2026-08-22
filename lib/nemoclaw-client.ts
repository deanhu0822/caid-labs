import type { NewBuildPrototypeAdapter } from './new-build-adapter';

/** Reuses Forma's existing Start-from-Scratch generation-input contract. */
export type GenerateRequest = Parameters<NewBuildPrototypeAdapter['analyzeIntent']>[0];

async function safeErrorMessage(response: Response) {
  const type = response.headers.get('content-type') || '';
  if (type.includes('json') || type.startsWith('text/')) {
    const message = (await response.text()).trim();
    if (message) return message.slice(0, 600);
  }
  return `NemoClaw generation failed with HTTP ${response.status}.`;
}

export async function generateWithNemoClaw(request: GenerateRequest): Promise<Blob> {
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: {
      Accept: '*/*',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(await safeErrorMessage(response));
  return response.blob();
}

export async function parseNemoClawJson<T = unknown>(blob: Blob): Promise<T> {
  if (!blob.type.toLowerCase().includes('json')) {
    throw new TypeError(`Expected a JSON NemoClaw result, received ${blob.type || 'an unknown MIME type'}.`);
  }
  return JSON.parse(await blob.text()) as T;
}
