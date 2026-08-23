import { mockFormaInferenceProvider } from './forma-inference';

export type ScannerMatch = {
  status: 'matched';
  mode: 'nvidia-build-vision' | 'simulated-label-match' | 'manual-observation';
  artifactId: string;
  label: string;
  confidence: number | null;
  explanation: string;
  bounds: { x: number; y: number; width: number; height: number };
};

export type ScannerNeedsConfirmation = {
  status: 'needs-confirmation';
  mode: 'no-inference';
  explanation: string;
};

export type ScannerAnalysis = ScannerMatch | ScannerNeedsConfirmation;

export interface ScannerAnalysisAdapter {
  readonly inferenceConnected: boolean;
  analyze(file: File): Promise<ScannerAnalysis>;
  confirmArtifact(artifactId: string, label: string): ScannerMatch;
}

type ConfiguredMediaObservation = {
  mode?: string;
  inferencePerformed?: boolean;
  summary?: string;
  labels?: Array<{ label?: string; confidence?: number | null }>;
};

const waitForVideoEvent = (video: HTMLVideoElement, event: 'loadedmetadata' | 'loadeddata' | 'seeked') => new Promise<void>((resolve, reject) => {
  const timeout = window.setTimeout(() => reject(new Error(`Timed out while reading video ${event}.`)), 12_000);
  const cleanup = () => {
    window.clearTimeout(timeout);
    video.removeEventListener(event, onReady);
    video.removeEventListener('error', onError);
  };
  const onReady = () => {
    cleanup();
    resolve();
  };
  const onError = () => {
    cleanup();
    reject(new Error('The selected video could not be decoded in this browser.'));
  };
  video.addEventListener(event, onReady, { once: true });
  video.addEventListener('error', onError, { once: true });
});

async function videoContactSheet(file: File) {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;
  try {
    await waitForVideoEvent(video, 'loadedmetadata');
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) await waitForVideoEvent(video, 'loadeddata');
    const sourceWidth = Math.max(1, video.videoWidth);
    const sourceHeight = Math.max(1, video.videoHeight);
    const cellWidth = Math.min(640, sourceWidth);
    const cellHeight = Math.max(1, Math.round(sourceHeight * (cellWidth / sourceWidth)));
    const canvas = document.createElement('canvas');
    canvas.width = cellWidth * 2;
    canvas.height = cellHeight * 2;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Video frame canvas is unavailable.');
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const times = duration > 0
      ? [0.05, 0.35, 0.65, 0.95].map((fraction) => Math.min(Math.max(0, duration - 0.05), duration * fraction))
      : [0, 0, 0, 0];
    for (let index = 0; index < times.length; index += 1) {
      if (Math.abs(video.currentTime - times[index]) > 0.01) {
        video.currentTime = times[index];
        await waitForVideoEvent(video, 'seeked');
      }
      context.drawImage(video, (index % 2) * cellWidth, Math.floor(index / 2) * cellHeight, cellWidth, cellHeight);
    }
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error('Could not encode sampled video frames.')),
      'image/jpeg',
      0.88,
    ));
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'video';
    return new File([blob], `${baseName}-sampled-frames.jpg`, { type: 'image/jpeg' });
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

export async function requestConfiguredMediaObservation(
  file: File,
  candidates: readonly (readonly [string, string])[] = [],
): Promise<ConfiguredMediaObservation> {
  const sourceKind = file.type.startsWith('video/') ? 'video' : 'image';
  const analysisFile = sourceKind === 'video' ? await videoContactSheet(file) : file;
  const form = new FormData();
  form.set('file', analysisFile);
  form.set('sourceKind', sourceKind);
  form.set('sourceName', file.name);
  form.set('sourceMimeType', file.type);
  form.set('sourceSizeBytes', String(file.size));
  if (candidates.length) {
    form.set('candidates', JSON.stringify(candidates.map(([artifactId, label]) => ({ artifactId, label }))));
  }
  const response = await fetch('/api/inference/media', { method: 'POST', body: form });
  if (!response.ok) throw new Error(`Media inference returned ${response.status}.`);
  return response.json() as Promise<ConfiguredMediaObservation>;
}

const FILE_LABEL_RULES = [
  { terms: ['j12', 'connector'], artifactId: 'j12', label: 'J12 Connector', confidence: 0.94 },
  { terms: ['motor'], artifactId: 'motor-bom', label: '24V Motor M2', confidence: 0.91 },
  { terms: ['battery'], artifactId: 'battery', label: 'Li-ion Battery', confidence: 0.9 },
  { terms: ['main-board', 'main_board', 'pcb'], artifactId: 'main-board', label: 'Main Control Board', confidence: 0.89 },
] as const;

export const localScannerAdapter: ScannerAnalysisAdapter = {
  inferenceConnected: false,
  async analyze(file) {
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    const observation = await mockFormaInferenceProvider.observeMedia({
      sourceId: `scanner-${file.name}`,
      kind: file.type.startsWith('video/') ? 'video' : 'image',
      name: file.name,
      mimeType: file.type,
      context: 'Match a physical rover component to the committed product graph.',
    });
    const normalizedName = file.name.toLowerCase();
    const match = FILE_LABEL_RULES.find((rule) => rule.terms.some((term) => normalizedName.includes(term)));
    if (!match) {
      return {
        status: 'needs-confirmation',
        mode: 'no-inference',
        explanation: `${observation.summary} Select the part shown in the media to create a user-confirmed graph observation.`,
      };
    }
    return {
      status: 'matched',
      mode: 'simulated-label-match',
      artifactId: match.artifactId,
      label: match.label,
      confidence: match.confidence,
      explanation: 'Mock-provider match based on the synthetic asset filename and label corpus—not computer-vision inference.',
      bounds: { x: 48, y: 35, width: 28, height: 24 },
    };
  },
  confirmArtifact(artifactId, label) {
    return {
      status: 'matched',
      mode: 'manual-observation',
      artifactId,
      label,
      confidence: null,
      explanation: 'User-confirmed engineering observation. No AI inference was claimed.',
      bounds: { x: 36, y: 30, width: 32, height: 30 },
    };
  },
};

export async function analyzeWithConfiguredInference(file: File, candidates: readonly (readonly [string, string])[]): Promise<ScannerAnalysis> {
  try {
    const result = await requestConfiguredMediaObservation(file, candidates);
    if (result.inferencePerformed) {
      const labels = Array.isArray(result.labels) ? result.labels : [];
      const top = labels
        .map((label) => ({
          ...label,
          candidate: candidates.find(([, candidateLabel]) => candidateLabel.toLowerCase() === String(label.label || '').toLowerCase()),
        }))
        .filter((label) => label.candidate)
        .sort((left, right) => Number(right.confidence || 0) - Number(left.confidence || 0))[0];
      if (top?.candidate) {
        return {
          status: 'matched',
          mode: 'nvidia-build-vision',
          artifactId: top.candidate[0],
          label: top.candidate[1],
          confidence: typeof top.confidence === 'number' ? top.confidence : null,
          explanation: result.summary || 'NVIDIA Build matched the acquired media to the product graph.',
          bounds: { x: 34, y: 28, width: 36, height: 34 },
        };
      }
      return {
        status: 'needs-confirmation',
        mode: 'no-inference',
        explanation: `${result.summary || 'NVIDIA Build analyzed the media but did not produce a confident graph match.'} Select the correct artifact to confirm it.`,
      };
    }
    if (result.mode === 'mock') return localScannerAdapter.analyze(file);
    return {
      status: 'needs-confirmation',
      mode: 'no-inference',
      explanation: `${result.summary || 'Live media inference is unavailable.'} Select the correct artifact to record a user-confirmed observation.`,
    };
  } catch {
    return {
      status: 'needs-confirmation',
      mode: 'no-inference',
      explanation: 'Live media inference could not be reached. Select the correct artifact to record a user-confirmed observation.',
    };
  }
}
