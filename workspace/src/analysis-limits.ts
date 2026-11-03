export const ANALYSIS_LIMITS = {
  sources: 8,
  fileBytes: 10 * 1024 * 1024,
  imageBytes: 5 * 1024 * 1024,
  totalBytes: 24 * 1024 * 1024,
  pdfPages: 30,
  textCharacters: 120_000,
  objectiveCharacters: 12_000,
  inputTokens: 350_000,
  outputTokens: 65_536,
} as const;
