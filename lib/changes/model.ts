export type Requirement = {
  id: string;
  statement: string;
  target: number;
  operator: ">=" | "<=";
  unit: string;
  conditions: string;
};
export type Alternative = {
  id: string;
  title: string;
  approach: string;
  tradeoffs: string;
  artifacts: { id: string; before: string; after: string }[];
};
export type Evidence = {
  id: string;
  requirementId: string;
  kind: "calculation" | "simulation" | "physical test" | "reference";
  result: number;
  source: string;
  method: string;
  limitations: string;
};
export type ChangeContent = {
  title: string;
  request: string;
  requirements: Requirement[];
  alternatives: Alternative[];
  selectedAlternative: string;
  selectionReason: string;
  evidence: Evidence[];
  reviewerIds: string[];
};
export type Review = {
  userId: string;
  name: string;
  decision: "approve" | "request changes";
  note: string;
  at: string;
  version: number;
};
export type Change = {
  id: string;
  product: string;
  baseline: number;
  authorId: string;
  version: number;
  status: "draft" | "in review" | "changes requested" | "saved";
  content: ChangeContent;
  reviews: Review[];
  createdAt: string;
  updatedAt: string;
  revision?: number;
};
export type User = {
  id: string;
  name: string;
  email: string;
  role: "owner" | "reviewer";
};
export type Revision = {
  product: string;
  number: number;
  changeId: string;
  at: string;
  savedBy: string;
  digest: string;
  artifacts: Record<string, string>;
  snapshot: Change;
};

export function emptyContent(): ChangeContent {
  return {
    title: "",
    request: "",
    requirements: [],
    alternatives: [],
    selectedAlternative: "",
    selectionReason: "",
    evidence: [],
    reviewerIds: [],
  };
}

export function evidencePasses(requirement: Requirement, evidence: Evidence) {
  return (
    evidence.kind !== "reference" &&
    (requirement.operator === ">="
      ? evidence.result >= requirement.target
      : evidence.result <= requirement.target)
  );
}

export function blockers(change: Change): string[] {
  const c = change.content;
  const issues: string[] = [];
  if (!c.title.trim() || !c.request.trim())
    issues.push("Describe the requested change.");
  if (!c.requirements.length)
    issues.push("Add at least one measurable requirement.");
  if (c.alternatives.length < 2)
    issues.push(
      "Compare at least two alternatives, including keeping the baseline if appropriate.",
    );
  const option = c.alternatives.find((a) => a.id === c.selectedAlternative);
  if (!option || !c.selectionReason.trim())
    issues.push("Select an alternative and explain the tradeoff.");
  if (option && !option.artifacts.length)
    issues.push("Record the selected alternative’s artifact changes.");
  for (const r of c.requirements) {
    const results = c.evidence.filter(
      (e) => e.requirementId === r.id && e.kind !== "reference",
    );
    if (!results.length)
      issues.push(
        `${r.statement || "Untitled requirement"}: add a calculation, simulation, or physical test result.`,
      );
    else if (results.some((e) => !evidencePasses(r, e)))
      issues.push(
        `${r.statement || "Untitled requirement"}: a result fails the requirement.`,
      );
  }
  if (!c.reviewerIds.length)
    issues.push("Assign at least one independent reviewer.");
  if (c.reviewerIds.includes(change.authorId))
    issues.push("The author cannot be their own reviewer.");
  return issues;
}

// Parse at the server boundary as well as in the editor; reject oversized or malformed records.
export function parseContent(value: unknown): ChangeContent {
  const obj = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== "object" || Array.isArray(v))
      throw new Error("Expected an object.");
    return v as Record<string, unknown>;
  };
  const str = (v: unknown, max = 4000, required = true) => {
    if (typeof v !== "string" || v.length > max || (required && !v.trim()))
      throw new Error("A required text field is missing or too long.");
    return v.trim();
  };
  const list = (v: unknown, max = 40): unknown[] => {
    if (!Array.isArray(v) || v.length > max)
      throw new Error("Invalid or oversized list.");
    return v;
  };
  const num = (v: unknown) => {
    if (typeof v !== "number" || !Number.isFinite(v))
      throw new Error("Enter a finite numeric target or result.");
    return v;
  };
  const id = (v: unknown) => {
    const result = str(v, 80);
    if (!/^[a-zA-Z0-9_-]+$/.test(result))
      throw new Error("Invalid record identifier.");
    return result;
  };
  const unique = (items: { id: string }[]) => {
    if (new Set(items.map((i) => i.id)).size !== items.length)
      throw new Error("Duplicate record identifier.");
  };
  const c = obj(value);
  const requirements = list(c.requirements).map((v) => {
    const r = obj(v);
    if (r.operator !== ">=" && r.operator !== "<=")
      throw new Error("Invalid comparison.");
    return {
      id: id(r.id),
      statement: str(r.statement),
      target: num(r.target),
      operator: r.operator,
      unit: str(r.unit, 80),
      conditions: str(r.conditions),
    } as Requirement;
  });
  const alternatives = list(c.alternatives, 10).map((v) => {
    const a = obj(v);
    const artifacts = list(a.artifacts).map((v) => {
      const f = obj(v);
      return { id: id(f.id), before: str(f.before), after: str(f.after) };
    });
    unique(artifacts);
    return {
      id: id(a.id),
      title: str(a.title, 200),
      approach: str(a.approach),
      tradeoffs: str(a.tradeoffs),
      artifacts,
    };
  });
  const evidence = list(c.evidence, 100).map((v) => {
    const e = obj(v);
    if (
      !["calculation", "simulation", "physical test", "reference"].includes(
        e.kind as string,
      )
    )
      throw new Error("Invalid evidence type.");
    const requirementId = id(e.requirementId);
    if (!requirements.some((r) => r.id === requirementId))
      throw new Error("Evidence must reference an existing requirement.");
    return {
      id: id(e.id),
      requirementId,
      kind: e.kind as Evidence["kind"],
      result: num(e.result),
      source: str(e.source),
      method: str(e.method),
      limitations: str(e.limitations),
    };
  });
  unique(requirements);
  unique(alternatives);
  unique(evidence);
  const reviewerIds = list(c.reviewerIds, 20).map(id);
  if (new Set(reviewerIds).size !== reviewerIds.length)
    throw new Error("Duplicate reviewer.");
  const selectedAlternative = str(c.selectedAlternative, 80, false);
  if (
    selectedAlternative &&
    !alternatives.some((a) => a.id === selectedAlternative)
  )
    throw new Error("Select an existing alternative.");
  return {
    title: str(c.title, 200),
    request: str(c.request),
    requirements,
    alternatives,
    selectedAlternative,
    selectionReason: str(c.selectionReason, 4000, false),
    evidence,
    reviewerIds,
  };
}
