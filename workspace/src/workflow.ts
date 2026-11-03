import { ARTIFACT_CATEGORIES, type Category } from "./product-types";
export type Item = {
  id: string;
  name: string;
  revision: string;
  description: string;
  origin?: "description" | "manual" | "analysis";
  category?: Category;
  sourceIds?: string[];
};
export type Link = {
  id: string;
  from: string;
  to: string;
  relation: string;
  sourceIds?: string[];
  basis?: "inferred" | "confirmed";
};
export type Comment = { id: string; text: string; resolved: boolean };
export type Workflow = {
  target: string;
  baseline: string;
  current?: string;
  proposed: string;
  unchanged: string;
  owner: string;
  reviewer: string;
  status: "Draft" | "In review" | "Changes requested" | "Reviewed";
  items: Item[];
  links: Link[];
  comments: Comment[];
};
export const emptyWorkflow = (): Workflow => ({
  target: "",
  baseline: "",
  proposed: "",
  unchanged: "",
  owner: "",
  reviewer: "",
  status: "Draft",
  items: [],
  links: [],
  comments: [],
});
export function validateWorkflow(value: unknown): Workflow {
  const w = value as Workflow;
  if (!w || typeof w !== "object") throw new Error("Invalid review context.");
  if (w.current !== undefined && typeof w.current !== "string")
    throw new Error("Invalid current design.");
  for (const key of [
    "target",
    "baseline",
    "proposed",
    "unchanged",
    "owner",
    "reviewer",
  ] as const)
    if (typeof w[key] !== "string") throw new Error("Invalid review field.");
  if (
    !["Draft", "In review", "Changes requested", "Reviewed"].includes(w.status)
  )
    throw new Error("Invalid review status.");
  if (
    !Array.isArray(w.items) ||
    !Array.isArray(w.links) ||
    !Array.isArray(w.comments)
  )
    throw new Error("Invalid review lists.");
  for (const i of w.items)
    if (
      !i ||
      !["id", "name", "revision", "description"].every(
        (k) => typeof (i as unknown as Record<string, unknown>)[k] === "string",
      )
    )
      throw new Error("Invalid part.");
  for (const i of w.items) {
    if (i.category !== undefined && !ARTIFACT_CATEGORIES.includes(i.category))
      throw new Error("Invalid part category.");
    if (
      i.origin !== undefined &&
      !["description", "manual", "analysis"].includes(i.origin)
    )
      throw new Error("Invalid part origin.");
    if (
      i.sourceIds !== undefined &&
      (!Array.isArray(i.sourceIds) ||
        i.sourceIds.some((id) => typeof id !== "string"))
    )
      throw new Error("Invalid part evidence.");
  }
  for (const l of w.links)
    if (
      l &&
      l.basis !== undefined &&
      !["inferred", "confirmed"].includes(l.basis)
    )
      throw new Error("Invalid relationship basis.");
  const ids = new Set(w.items.map((i) => i.id));
  if (ids.size !== w.items.length) throw new Error("Duplicate part.");
  for (const l of w.links)
    if (
      !l ||
      !["id", "from", "to", "relation"].every(
        (k) => typeof (l as unknown as Record<string, unknown>)[k] === "string",
      ) ||
      !ids.has(l.from) ||
      !ids.has(l.to) ||
      l.from === l.to
    )
      throw new Error("Invalid connection.");
  for (const l of w.links)
    if (
      l.sourceIds !== undefined &&
      (!Array.isArray(l.sourceIds) ||
        l.sourceIds.some((id) => typeof id !== "string"))
    )
      throw new Error("Invalid connection evidence.");
  for (const c of w.comments)
    if (
      !c ||
      typeof c.id !== "string" ||
      typeof c.text !== "string" ||
      typeof c.resolved !== "boolean"
    )
      throw new Error("Invalid comment.");
  if (w.status === "Reviewed" && reviewProblem(w))
    throw new Error(reviewProblem(w));
  return w;
}
export function reviewProblem(w: Workflow): string {
  if (!w.target.trim() || !w.baseline.trim())
    return "Identify the target and baseline revision.";
  if (!w.proposed.trim() || !w.unchanged.trim())
    return "Describe the proposed change and what stays unchanged.";
  if (!w.owner.trim() || !w.reviewer.trim())
    return "Add an owner and reviewer.";
  if (w.owner.trim().toLowerCase() === w.reviewer.trim().toLowerCase())
    return "Choose a reviewer different from the owner.";
  if (w.comments.some((c) => !c.resolved))
    return "Resolve the open comments before marking reviewed.";
  return "";
}
export function reviseWorkflow(
  w: Workflow,
  patch: Partial<Workflow>,
): Workflow {
  return { ...w, ...patch, status: "Draft" };
}
