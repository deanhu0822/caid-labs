import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  type NodeProps,
  type ReactFlowInstance,
  type Viewport,
  type Node,
  type Edge,
} from "@xyflow/react";
import { ArrowLeft, ArrowUpRight, GitBranch, X } from "lucide-react";
import {
  ARTIFACTS,
  REFERENCE_RELATIONS,
  REFERENCE_PROPERTIES,
  CATEGORY_META,
  EDGE_META,
  type Category,
} from "../rover";
import type { Source } from "../domain";
import type { Workflow } from "../workflow";

function ArtifactNode({ data, selected, id }: NodeProps) {
  return (
    <button
      aria-label={`Focus ${String(data.label)}`}
      onClick={(e) => {
        e.stopPropagation();
        (data.select as (id: string) => void)(id);
      }}
      className={`artifact-card ${selected ? "focused" : ""}`}
      style={{ borderLeftColor: String(data.color) }}
    >
      <Handle type="target" position={Position.Top} />
      <small>{String(data.kind)}</small>
      <strong>{String(data.label)}</strong>
      <span>{String(data.meta)}</span>
      <Handle type="source" position={Position.Bottom} />
    </button>
  );
}
const nodeTypes = { artifact: ArtifactNode };
const inferCategory = (name: string): Category =>
  /enclosure|housing|mount|chassis|wheel/i.test(name)
    ? "mechanical"
    : /firmware|software|service/i.test(name)
      ? "firmware"
      : /test/i.test(name)
        ? "tests"
        : "pcb";
export function AssemblyGraph({
  workflow,
  sources,
  onChange,
  onSource,
  onBack,
  onPropose,
  sample = false,
}: {
  workflow: Workflow;
  sources: Source[];
  onChange?: (w: Workflow) => void;
  onSource: (id: string) => void;
  onBack?: () => void;
  onPropose?: (name: string) => void;
  sample?: boolean;
}) {
  const [focused, setFocused] = useState<string | null>(null),
    [categories, setCategories] = useState<string[]>(
      Object.keys(CATEGORY_META),
    ),
    [edgeKinds, setEdgeKinds] = useState<string[]>([
      ...Object.keys(EDGE_META),
      "reference",
      "custom",
    ]),
    [labels, setLabels] = useState("auto");
  const [filtersOpen,setFiltersOpen]=useState(false);
  const stage = useRef<HTMLDivElement | null>(null);
  const flow = useRef<ReactFlowInstance | null>(null),
    overview = useRef<Viewport | null>(null);
  const data = useMemo(() => {
    if (sample)
      return {
        artifacts: ARTIFACTS.map((a) => ({
          ...a,
          ...(a.id === "chassis"
            ? { x: 230, y: 195 }
            : a.id === "motor-load-test"
              ? { x: 410, y: 875 }
              : {}),
          description: "Original CAID synthetic reference fixture.",
          sourceId: undefined as string | undefined,
        })),
        relations: REFERENCE_RELATIONS.map((l) => ({
          ...l,
          label: EDGE_META[l.kind].label,
          basis: "sample",
          sourceIds: [] as string[],
        })),
      };
    const artifacts = workflow.items.map((a, i) => ({
      id: a.id,
      label: a.name,
      category: (i === 0
        ? "overview"
        : (a.category ?? inferCategory(a.name))) as Category,
      code: a.revision || "Revision not specified",
      meta:
        a.origin === "description"
          ? "From description"
          : a.origin === "analysis"
            ? "AI suggestion"
            : "User supplied",
      x: i === 0 ? 420 : 80 + ((i - 1) % 3) * 340,
      y: i === 0 ? 0 : 170 + Math.floor((i - 1) / 3) * 170,
      description: a.description,
      sourceId: undefined as string | undefined,
    }));
    const bottom = 220 + Math.ceil(Math.max(0, artifacts.length - 1) / 3) * 170;
    sources.forEach((s, i) =>
      artifacts.push({
        id: `source:${s.id}`,
        label: s.name,
        category: "documents",
        code: s.kind.toUpperCase(),
        meta: s.kind==="image"?"Visual reference":s.readNotice ?? "Attached reference",
        x: 80 + (i % 3) * 340,
        y: bottom + Math.floor(i / 3) * 150,
        description: s.note || "Open the original to inspect its content.",
        sourceId: s.id,
      }),
    );
    const relations = workflow.links.map((l) => ({
      id: l.id,
      source: l.from,
      target: l.to,
      kind: Object.keys(EDGE_META).includes(l.relation) ? l.relation : "custom",
      label: l.relation,
      sourceIds: l.sourceIds ?? [],
      basis: l.basis ?? "confirmed",
      description:
        l.basis === "inferred"
          ? "Suggested relationship; confirm against product evidence."
          : l.relation,
    }));
    workflow.items.forEach((i) =>
      i.sourceIds?.forEach((s) => {
        if (sources.some((x) => x.id === s))
          relations.push({
            id: `reference:${i.id}:${s}`,
            source: i.id,
            target: `source:${s}`,
            kind: "reference",
            label: "Reference",
            sourceIds: [s],
            basis: "inferred",
            description:
              "Related source; this link does not establish installation or compatibility.",
          });
      }),
    );
    return { artifacts, relations };
  }, [workflow.items, workflow.links, sources, sample]);
  const visible = data.artifacts.filter((a) => categories.includes(a.category)),
    ids = new Set(visible.map((a) => a.id));
  const relations = data.relations.filter(
    (l) => ids.has(l.source) && ids.has(l.target) && edgeKinds.includes(l.kind),
  );
  const neighbors = new Set([
    ...(focused ? [focused] : []),
    ...relations
      .filter((l) => l.source === focused || l.target === focused)
      .flatMap((l) => [l.source, l.target]),
  ]);
  const part = data.artifacts.find((a) => a.id === focused);
  const restore = useCallback(() => {
    setFocused(null);
    if (overview.current)
      void flow.current?.setViewport(overview.current, { duration: 250 });
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[role=dialog]")) {
        e.stopPropagation();
        restore();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [restore]);
  useEffect(() => {
    if (focused && !visible.some((a) => a.id === focused)) restore();
  }, [focused, visible, restore]);
  const select = (id: string) => {
    if (id === focused) {
      restore();
      return;
    }
    if (!focused) overview.current = flow.current?.getViewport() ?? null;
    setFocused(id);
  };
  // Fit against the actual resized canvas; the inspector changes its width.
  useEffect(() => {
    if (!focused || !stage.current) return;
    const related = visible.filter((a) => neighbors.has(a.id));
    if (!related.length) return;
    const minX = Math.min(...related.map((a) => a.x)),
      minY = Math.min(...related.map((a) => a.y)),
      w = Math.max(...related.map((a) => a.x + 158)) - minX,
      h = Math.max(...related.map((a) => a.y + 68)) - minY;
    const width = stage.current.clientWidth,
      height = stage.current.clientHeight;
    const zoom = Math.min(
      1,
      (width - 90) / (w + 100),
      (height - 230) / (h + 100),
    );
    void flow.current?.setViewport(
      {
        zoom: Math.max(0.15, zoom),
        x: (width - w * zoom) / 2 - minX * zoom,
        y: 125 + (height - 210 - h * zoom) / 2 - minY * zoom,
      },
      { duration: 200 },
    );
  }, [focused]);
  const nodes: Node[] = visible.map((a) => ({
    id: a.id,
    type: "artifact",
    position: { x: a.x, y: a.y },
    selected: focused === a.id,
    data: {
      label: a.label,
      kind: a.code,
      meta: a.meta,
      color: CATEGORY_META[a.category].color,
      select,
    },
    style: { opacity: focused && !neighbors.has(a.id) ? 0.22 : 1 },
    width: 158,
    height: 68,
  }));
  const edges: Edge[] = relations.map((l) => {
    const color = ["reference", "custom"].includes(l.kind)
      ? "#8da5d8"
      : EDGE_META[l.kind as keyof typeof EDGE_META].color;
    return {
      id: l.id,
      source: l.source,
      target: l.target,
      label:
        labels === "always" ||
        (labels === "auto" &&
          focused &&
          (l.source === focused || l.target === focused))
          ? l.label
          : undefined,
      markerEnd: { type: MarkerType.ArrowClosed, color },
      style: {
        stroke: color,
        strokeDasharray: l.basis === "confirmed" ? undefined : "5 5",
        opacity:
          (focused && !neighbors.has(l.source)) ||
          (focused && !neighbors.has(l.target))
            ? 0.1
            : 0.8,
      },
      labelStyle: { fill: "#c4d0df", fontSize: 10 },
      labelBgStyle: { fill: "#0d1420" },
      type: "default",
    };
  });
  const toggle = (v: string, current: string[], set: (v: string[]) => void) =>
    set(current.includes(v) ? current.filter((x) => x !== v) : [...current, v]);
  return (
    <section
      className={`product-explorer ${part ? "has-focus" : ""} ${filtersOpen?"filters-open":""}`}
      aria-label="Product graph workspace"
    >
      <aside className="graph-filters">
        <button className="text-button mobile-filter-button" onClick={()=>setFiltersOpen(false)}>Close filters</button>
        <button className="text-button" onClick={onBack}>
          <ArrowLeft size={15} /> Dashboard
        </button>
        <div className="graph-summary">
          <GitBranch size={15} />
          <strong>
            {sample ? "Reference product · Rev C" : "Working product"}
          </strong>
          <p>
            {data.artifacts.length} artifacts · {data.relations.length}{" "}
            relationships
          </p>
          <small>
            {sample ? "Synthetic CAID sample" : "AI suggestions require review"}
          </small>
        </div>
        <label className="mobile-filter-button">Edge labels<select aria-label="Edge labels" value={labels} onChange={e=>setLabels(e.target.value)}><option value="auto">Auto</option><option value="always">Always</option><option value="off">Off</option></select></label>
        <h3>Artifacts</h3>
        {Object.entries(CATEGORY_META)
          .filter(([key]) => data.artifacts.some((a) => a.category === key))
          .map(([key, m]) => (
            <label className="graph-filter" key={key}>
              <input
                type="checkbox"
                checked={categories.includes(key)}
                onChange={() => toggle(key, categories, setCategories)}
              />
              <i style={{ background: m.color }} />
              {m.label}
              <small>
                {data.artifacts.filter((a) => a.category === key).length}
              </small>
            </label>
          ))}
        <h3>Relationships</h3>
        {[
          ...Object.entries(EDGE_META),
          ["reference", { label: "Reference", color: "#8da5d8" }] as const,
          [
            "custom",
            { label: "Other relationships", color: "#8da5d8" },
          ] as const,
        ]
          .filter(([key]) => data.relations.some((l) => l.kind === key))
          .map(([key, m]) => (
            <label className="graph-filter" key={key}>
              <input
                type="checkbox"
                checked={edgeKinds.includes(key)}
                onChange={() => toggle(key, edgeKinds, setEdgeKinds)}
              />
              <i style={{ background: m.color }} />
              {m.label}
            </label>
          ))}
      </aside>
      <div className="explorer-stage" ref={stage}>
        <header>
          <div>
            <button className="text-button mobile-filter-button" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(!filtersOpen)}>Filters</button>
            <button className="text-button mobile-graph-back" onClick={onBack}>
              <ArrowLeft size={14} />
              Dashboard
            </button>
            <h2>
              {sample
                ? "Autonomous Inspection Rover"
                : workflow.items[0]?.name || workflow.target || "Product graph"}
            </h2>
            <p>
              {focused
                ? `${neighbors.size - 1} related artifacts highlighted`
                : "Overview"}
              {sample ? " · Reference sample" : ""}
            </p>
          </div>
          <label>
            Edge labels
            <select
              aria-label="Edge labels"
              value={labels}
              onChange={(e) => setLabels(e.target.value)}
            >
              <option value="auto">Auto</option>
              <option value="always">Always</option>
              <option value="off">Off</option>
            </select>
          </label>
        </header>
        {nodes.length ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onInit={(f) => {
              flow.current = f;
            }}
            onPaneClick={restore}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.15}
            maxZoom={1.8}
            nodesConnectable={false}
            nodesDraggable={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#26354a" gap={24} size={0.6} />
            <Controls showInteractive={false} />
            <MiniMap
              nodeColor={(n) => String(n.data.color)}
              pannable
              zoomable
            />
          </ReactFlow>
        ) : (
          <div className="graph-no-results">
            No artifacts in this view. Select an artifact category or add
            product evidence.
          </div>
        )}
        <footer>
          Click to focus · click again, background, or Escape to restore
        </footer>
      </div>
      {part && (
        <aside className="artifact-inspector" aria-label="Artifact inspector">
          <div className="artifact-inspector-top">
            <span style={{ color: CATEGORY_META[part.category].color }}>
              {part.code}
            </span>
            <button
              className="icon-button"
              aria-label="Restore graph overview"
              onClick={restore}
            >
              <X size={18} />
            </button>
          </div>
          <h1>{part.label}</h1>
          <p>{part.meta}</p>
          <section className="artifact-preview">
            <h3>{CATEGORY_META[part.category].label}</h3>
            <p>{part.description}</p>
            {part.sourceId && (
              <button
                className="secondary-button"
                onClick={() => onSource(part.sourceId!)}
              >
                Open original
                <ArrowUpRight size={15} />
              </button>
            )}
          </section>
          <h3>{sample?'Sample properties':'Properties'}</h3>
          <dl>{Object.entries(sample?{Identifier:part.meta,...(REFERENCE_PROPERTIES[part.id]??{Type:CATEGORY_META[part.category].label})}:{Identifier:part.id,Origin:part.meta,Status:'Requires review'}).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          {!part.sourceId && (
            <button
              className="propose-from-artifact"
              onClick={() => onPropose?.(part.label)}
            >
              Propose a change
              <small>Review {part.label} and its dependencies</small>
            </button>
          )}
          <h3>
            Relationships ·{" "}
            {
              relations.filter(
                (l) => l.source === part.id || l.target === part.id,
              ).length
            }
          </h3>
          {relations
            .filter((l) => l.source === part.id || l.target === part.id)
            .map((l) => (
              <div className="artifact-relation" key={l.id}>
                <button
                  onClick={() =>
                    select(l.source === part.id ? l.target : l.source)
                  }
                >
                  {
                    data.artifacts.find(
                      (a) =>
                        a.id === (l.source === part.id ? l.target : l.source),
                    )?.label
                  }
                  <small>{l.label}</small>
                </button>
                <p>{l.description}</p>
                {l.sourceIds
                  .filter((id) => sources.some((s) => s.id === id))
                  .map((id) => (
                    <button
                      className="citation"
                      key={id}
                      onClick={() => onSource(id)}
                    >
                      {sources.find((s) => s.id === id)?.name}
                      <ArrowUpRight size={12} />
                    </button>
                  ))}
                <small>
                  {l.basis === "sample"
                    ? "Sample relationship"
                    : l.basis === "inferred"
                      ? "Unconfirmed"
                      : "Confirmed by user"}
                </small>
                {l.basis === "inferred" &&
                  !l.id.startsWith("reference:") &&
                  onChange && (
                    <button
                      className="text-button"
                      onClick={() =>
                        onChange({
                          ...workflow,
                          status: "Draft",
                          links: workflow.links.map((x) =>
                            x.id === l.id ? { ...x, basis: "confirmed" } : x,
                          ),
                        })
                      }
                    >
                      Confirm relationship
                    </button>
                  )}
              </div>
            ))}
        </aside>
      )}
    </section>
  );
}
