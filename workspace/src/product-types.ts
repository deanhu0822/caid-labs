export const ARTIFACT_CATEGORIES = [
  "overview",
  "mechanical",
  "pcb",
  "firmware",
  "bom",
  "manufacturing",
  "suppliers",
  "tests",
  "agents",
  "documents",
] as const;
export type Category = (typeof ARTIFACT_CATEGORIES)[number];
