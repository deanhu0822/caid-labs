export type ScannerMatch = {
  status: 'matched';
  mode: 'simulated-label-match' | 'manual-observation';
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
    const normalizedName = file.name.toLowerCase();
    const match = FILE_LABEL_RULES.find((rule) => rule.terms.some((term) => normalizedName.includes(term)));
    if (!match) {
      return {
        status: 'needs-confirmation',
        mode: 'no-inference',
        explanation: 'Image acquired locally. No vision model is connected, so Forma will not claim an automatic detection. Confirm the observed product object below.',
      };
    }
    return {
      status: 'matched',
      mode: 'simulated-label-match',
      artifactId: match.artifactId,
      label: match.label,
      confidence: match.confidence,
      explanation: 'Demo match based on the synthetic asset filename and label corpus—not computer-vision inference.',
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
