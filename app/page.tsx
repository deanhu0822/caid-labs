'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Node,
  type NodeProps,
  useNodesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Activity,
  Bot,
  Box,
  Cable,
  Camera,
  Check,
  ChevronRight,
  CircleDot,
  Cpu,
  Focus,
  GitBranch,
  Layers3,
  Maximize2,
  Play,
  ScanLine,
  Search,
  Send,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import {
  ARTIFACTS,
  BUILDER_BLAST,
  BUILDER_SUGGESTIONS,
  CATEGORY_META,
  DETAIL_OVERRIDES,
  EDGE_META,
  IMPACT_ITEMS,
  J12_BLAST,
  RELATIONS,
  REVISION_CHANGES,
  type Artifact,
  type Category,
  type EdgeKind,
} from './product-data';
import type { AgentKind, AgentResponse, CorpusHealth } from '@/lib/corpus-types';

type ArtifactData = Artifact & { activeRevision: string };
type ArtifactNode = Node<ArtifactData, 'artifact'>;
type AppMode = 'graph' | 'builder' | 'scanner' | 'agents';

function ProductNode({ data, selected }: NodeProps<ArtifactNode>) {
  return (
    <div className="artifact-node-inner">
      <Handle type="target" position={Position.Top} />
      <div className="node-topline">
        <span>{data.code}</span>
        {data.category === 'agents' && <b>LOCAL</b>}
        {selected && <b className="focus-tag">FOCUS</b>}
      </div>
      <strong>{data.label}</strong>
      <small>{data.meta}{data.revision ? ` · ${data.activeRevision}` : ''}</small>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { artifact: ProductNode };

const initialNodes: ArtifactNode[] = ARTIFACTS.map((artifact) => ({
  id: artifact.id,
  type: 'artifact',
  position: { x: artifact.x, y: artifact.y },
  data: { ...artifact, activeRevision: 'Rev C' },
}));

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function askAgent(agent: AgentKind, question: string): Promise<AgentResponse> {
  const response = await fetch('/api/agents/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent, question }),
  });
  const payload = await response.json() as AgentResponse & { error?: string };
  if (!response.ok) throw new Error(payload.error || 'The corpus agent could not answer that question.');
  return payload;
}

export default function Home() {
  const [allNodes, , onNodesChange] = useNodesState<ArtifactNode>(initialNodes);
  const [activeCategories, setActiveCategories] = useState<Set<Category>>(new Set(Object.keys(CATEGORY_META) as Category[]));
  const [activeEdges, setActiveEdges] = useState<Set<EdgeKind>>(new Set(Object.keys(EDGE_META) as EdgeKind[]));
  const [selectedId, setSelectedId] = useState('j12');
  const [mode, setMode] = useState<AppMode>('graph');
  const [impactOpen, setImpactOpen] = useState(false);
  const [builderQuery, setBuilderQuery] = useState('');
  const [builderResult, setBuilderResult] = useState(false);
  const [builderAnswer, setBuilderAnswer] = useState<AgentResponse | null>(null);
  const [builderLoading, setBuilderLoading] = useState(false);
  const [builderError, setBuilderError] = useState('');
  const [reasonedArtifactIds, setReasonedArtifactIds] = useState<string[]>([]);
  const [scannerMatched, setScannerMatched] = useState(false);
  const [revision, setRevision] = useState('Rev C');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoLabel, setDemoLabel] = useState('');
  const demoToken = useRef(0);

  const selectedArtifact = ARTIFACTS.find((node) => node.id === selectedId) ?? ARTIFACTS[0];

  const connectedIds = useMemo(() => {
    const ids = new Set<string>();
    RELATIONS.forEach((edge) => {
      if (edge.source === selectedId) ids.add(edge.target);
      if (edge.target === selectedId) ids.add(edge.source);
    });
    return [...ids];
  }, [selectedId]);

  const highlighted = useMemo(() => {
    if (impactOpen) return new Set(J12_BLAST);
    if (mode === 'builder' && builderResult) return new Set(reasonedArtifactIds.length ? reasonedArtifactIds : BUILDER_BLAST);
    if (mode === 'agents' && reasonedArtifactIds.length) return new Set(reasonedArtifactIds);
    if (mode === 'scanner' && scannerMatched) return new Set(J12_BLAST);
    if (selectedId === 'j12') return new Set(J12_BLAST);
    return new Set([selectedId, ...connectedIds]);
  }, [builderResult, connectedIds, impactOpen, mode, reasonedArtifactIds, scannerMatched, selectedId]);

  const visibleNodes = useMemo(() => allNodes
    .filter((node) => activeCategories.has(node.data.category))
    .map((node) => {
      const isHighlighted = highlighted.has(node.id);
      const isChanged = REVISION_CHANGES[revision].includes(node.id);
      return {
        ...node,
        data: { ...node.data, activeRevision: revision },
        selected: node.id === selectedId,
        className: [
          `artifact-node category-${node.data.category}`,
          isHighlighted ? 'is-highlighted' : 'is-dimmed',
          isChanged ? 'is-changed' : '',
        ].join(' '),
      };
    }), [activeCategories, allNodes, highlighted, revision, selectedId]);

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleEdges = useMemo(() => RELATIONS
    .filter((edge) => activeEdges.has(edge.kind) && visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
    .map((edge) => {
      const active = highlighted.has(edge.source) && highlighted.has(edge.target);
      const color = active ? EDGE_META[edge.kind].color : '#3c465d';
      return {
        ...edge,
        animated: true,
        className: active ? 'relation-active' : 'relation-dimmed',
        style: { stroke: color, strokeWidth: active ? 2 : 1.15 },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 12, height: 12 },
      };
    }), [activeEdges, highlighted, visibleNodeIds]);

  const toggleCategory = (category: Category) => {
    setActiveCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category); else next.add(category);
      return next;
    });
  };

  const toggleEdge = (kind: EdgeKind) => {
    setActiveEdges((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind); else next.add(kind);
      return next;
    });
  };

  const chooseNode = (id: string) => {
    setSelectedId(id);
    if (!activeCategories.has(ARTIFACTS.find((item) => item.id === id)!.category)) {
      setActiveCategories((current) => new Set([...current, ARTIFACTS.find((item) => item.id === id)!.category]));
    }
  };

  const runBuilder = async (query = builderQuery) => {
    const objective = (query || 'Increase payload capacity').trim();
    setBuilderQuery(objective);
    setBuilderResult(false);
    setBuilderError('');
    setBuilderLoading(true);
    try {
      const result = await askAgent('builder', objective);
      setBuilderAnswer(result);
      setBuilderResult(true);
      setReasonedArtifactIds(result.artifactIds);
      const firstVisibleId = result.artifactIds.find((id) => ARTIFACTS.some((artifact) => artifact.id === id));
      if (firstVisibleId) setSelectedId(firstVisibleId);
    } catch (error) {
      setBuilderError(error instanceof Error ? error.message : 'Builder query failed.');
    } finally {
      setBuilderLoading(false);
    }
  };

  const runDemo = async () => {
    if (demoRunning) return;
    const token = ++demoToken.current;
    setDemoRunning(true);
    setBuilderResult(false);
    setBuilderAnswer(null);
    setBuilderError('');
    setReasonedArtifactIds([]);
    setScannerMatched(false);
    setImpactOpen(false);
    setMode('graph');
    setSelectedId('j12');
    setDemoLabel('1 / 5 · Mapping J12 dependencies');
    await sleep(1600);
    if (token !== demoToken.current) return;
    setImpactOpen(true);
    setDemoLabel('2 / 5 · Calculating change impact');
    await sleep(2200);
    setImpactOpen(false);
    setMode('builder');
    setBuilderQuery('Increase payload capacity');
    setDemoLabel('3 / 5 · Builder is narrowing the graph');
    await sleep(600);
    await runBuilder('Increase payload capacity');
    await sleep(2200);
    setMode('scanner');
    setScannerMatched(false);
    setDemoLabel('4 / 5 · Scanning physical assembly');
    await sleep(2200);
    setScannerMatched(true);
    setSelectedId('j12');
    setDemoLabel('5 / 5 · Physical part matched to graph');
    await sleep(2000);
    setDemoRunning(false);
    setDemoLabel('Demo complete · J12 match confirmed');
    await sleep(2200);
    setDemoLabel('');
  };

  const details = DETAIL_OVERRIDES[selectedId] ?? {
    Type: CATEGORY_META[selectedArtifact.category].label,
    Revision: revision,
    Identifier: selectedArtifact.meta,
    Status: selectedArtifact.category === 'agents' ? 'LOCAL' : 'Released',
  };

  const searchResults = searchTerm.trim()
    ? ARTIFACTS.filter((node) => `${node.label} ${node.meta}`.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 7)
    : ARTIFACTS.slice(0, 7);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark"><GitBranch size={16} /></div>
        <div className="brand">FORMA <span>/</span> rover-alpha <span>/</span> {revision.toLowerCase().replace(' ', '-')}</div>
        <nav aria-label="Workspace modes">
          {(['graph', 'builder', 'scanner'] as AppMode[]).map((item) => (
            <button key={item} className={mode === item ? 'active' : ''} onClick={() => setMode(item)}>
              {item === 'graph' ? <Layers3 size={14} /> : item === 'builder' ? <Sparkles size={14} /> : <ScanLine size={14} />}
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
          <button className={mode === 'agents' ? 'active' : ''} onClick={() => setMode('agents')}><Bot size={14} /> Agents</button>
        </nav>
        <div className="header-actions">
          <button onClick={() => setSearchOpen(true)}><Search size={15} /> <span>Search graph</span><kbd>/</kbd></button>
          <button className="demo-top" onClick={runDemo} disabled={demoRunning}><Play size={14} /> {demoRunning ? 'Running…' : 'Run Demo'}</button>
          <button className="accent" onClick={() => { setMode('builder'); setBuilderResult(false); setBuilderAnswer(null); setBuilderError(''); }}><Sparkles size={15} /> Builder</button>
        </div>
      </header>

      <aside className="sidebar">
        <div className="side-heading"><div className="eyebrow">PRODUCT GRAPH</div><span>34 nodes</span></div>
        <div className="filter-group">
          {(Object.keys(CATEGORY_META) as Category[]).map((category) => {
            const meta = CATEGORY_META[category];
            const count = ARTIFACTS.filter((node) => node.category === category).length;
            const active = activeCategories.has(category);
            return (
              <button key={category} className={`filter-row ${active ? 'enabled' : ''}`} onClick={() => toggleCategory(category)} aria-pressed={active}>
                <span className="filter-check">{active && <Check size={10} />}</span>
                <span className="category-dot" style={{ background: meta.color, boxShadow: active ? `0 0 9px ${meta.color}` : 'none' }} />
                <span>{meta.label}</span><em>{String(count).padStart(2, '0')}</em>
              </button>
            );
          })}
        </div>
        <div className="section-heading"><div className="eyebrow">EDGE TYPES</div><button onClick={() => setActiveEdges(new Set(Object.keys(EDGE_META) as EdgeKind[]))}>all</button></div>
        <div className="filter-group edge-filters">
          {(Object.keys(EDGE_META) as EdgeKind[]).map((kind) => {
            const active = activeEdges.has(kind);
            return (
              <button key={kind} className={`filter-row ${active ? 'enabled' : ''}`} onClick={() => toggleEdge(kind)} aria-pressed={active}>
                <span className="filter-check">{active && <Check size={10} />}</span>
                <span className="edge-swatch" style={{ background: EDGE_META[kind].color }} />
                <span>{EDGE_META[kind].label}</span>
              </button>
            );
          })}
        </div>
        <div className="sidebar-note"><CircleDot size={14} /><span><strong>Graph health 96%</strong>2 unresolved links</span></div>
      </aside>

      <section className="graph-stage">
        <div className="graph-meta">
          <span>Autonomous Inspection Rover</span>
          <small>REV C · DVT BUILD · 34 ARTIFACTS · 40 RELATIONSHIPS</small>
        </div>
        <div className="blast-legend"><span className="pulse-dot" /> {highlighted.size - 1} connected artifacts in focus</div>
        <ReactFlow
          nodes={visibleNodes}
          edges={visibleEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={(_, node) => chooseNode(node.id)}
          onPaneClick={() => { if (!impactOpen && mode === 'graph') setSelectedId(''); }}
          fitView
          fitViewOptions={{ padding: 0.13, minZoom: 0.42, maxZoom: 0.8 }}
          minZoom={0.35}
          maxZoom={1.7}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#273149" gap={26} size={1} variant={BackgroundVariant.Dots} />
          <Controls showInteractive={false} position="top-right" />
          <MiniMap pannable zoomable position="bottom-right" nodeColor={(node) => CATEGORY_META[(node.data as ArtifactData).category].color} maskColor="rgba(6, 9, 16, .84)" />
        </ReactFlow>

        <div className="graph-hint"><Focus size={13} /> Scroll to zoom · drag canvas to pan · select to trace impact</div>

        <>
          {mode === 'builder' && (
            <section className="mode-panel builder-panel panel-enter" key="builder">
              <div className="mode-panel-head"><div><span className="mode-icon"><Sparkles size={15} /></span><div><div className="eyebrow">OBJECTIVE MODE</div><h3>Builder</h3></div></div><button onClick={() => setMode('graph')}><X size={15} /></button></div>
              <p>Describe the outcome. Builder surfaces only the product relationships relevant to it.</p>
              <label className="builder-input"><input value={builderQuery} onChange={(e) => setBuilderQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void runBuilder(); } }} placeholder="What are you trying to build or change?" /><button disabled={builderLoading} onClick={() => void runBuilder()} aria-label="Ask Builder"><Send size={14} /></button></label>
              <div className="suggestions">{BUILDER_SUGGESTIONS.map((suggestion) => <button key={suggestion} disabled={builderLoading} onClick={() => void runBuilder(suggestion)}>{suggestion}</button>)}</div>
              {builderLoading && <div className="backend-loading"><span className="pulse-dot" /> Reading the rover corpus and tracing dependencies...</div>}
              {builderError && <div className="backend-error">{builderError}</div>}
              <>
                {builderResult && builderAnswer && (
                  <div className="recommendation panel-enter">
                    <div className="recommendation-label"><Zap size={13} /> LIVE CORPUS RECOMMENDATION</div>
                    <h4>{builderAnswer.matchedTask?.prompt ?? builderQuery}</h4>
                    <div className="metric-row"><span><b>{Math.round(builderAnswer.confidence * 100)}%</b> confidence</span><span><b>{builderAnswer.artifactIds.length}</b> artifacts</span><span><b>{builderAnswer.latencyMs}ms</b> local query</span></div>
                    <p>{builderAnswer.answer}</p>
                    <EvidenceList evidence={builderAnswer.evidence} limit={3} />
                    <div className="affected-line"><span>{builderAnswer.mode === 'ground-truth' ? 'Validated scenario match' : 'Ranked corpus retrieval'}</span><button onClick={() => setMode('graph')}>View graph <ChevronRight size={12} /></button></div>
                  </div>
                )}
              </>
            </section>
          )}

          {mode === 'scanner' && (
            <section className="mode-panel scanner-panel panel-enter" key="scanner">
              <div className="mode-panel-head"><div><span className="mode-icon"><Camera size={15} /></span><div><div className="eyebrow">PHYSICAL INPUT</div><h3>Scanner</h3></div></div><button onClick={() => setMode('graph')}><X size={15} /></button></div>
              <div className={`scanner-view ${scannerMatched ? 'matched' : ''}`}>
                <div className="scan-line" />
                <div className="rover-silhouette"><div className="rover-body" /><div className="rover-camera" /><i className="wheel one" /><i className="wheel two" /><i className="connector-target" /></div>
                <div className="target-bracket"><span>J12</span></div>
                <div className="scan-readout"><span>CAM 01</span><span>LOCAL VISION · 94%</span></div>
              </div>
              <div className="scanner-status">
                <span className="scanner-status-icon">{scannerMatched ? <Check size={15} /> : <ScanLine size={15} />}</span>
                <div><strong>{scannerMatched ? 'J12 Connector detected' : 'Ready to scan assembly'}</strong><small>{scannerMatched ? 'Matched to product graph · Rev C' : 'Camera simulation · no data leaves this device'}</small></div>
              </div>
              <button className="scan-button" onClick={() => { setScannerMatched(false); window.setTimeout(() => { setScannerMatched(true); setSelectedId('j12'); }, 1200); }}><ScanLine size={15} /> {scannerMatched ? 'Scan again' : 'Simulate scan'}</button>
            </section>
          )}
        </>
      </section>

      <aside className={`details ${mode === 'agents' ? 'agents-open' : ''}`}>
        {mode === 'agents' ? (
          <AgentPanel
            onClose={() => setMode('graph')}
            onArtifacts={(ids) => {
              setReasonedArtifactIds(ids);
              const firstVisibleId = ids.find((id) => ARTIFACTS.some((artifact) => artifact.id === id));
              if (firstVisibleId) setSelectedId(firstVisibleId);
            }}
          />
        ) : (
          <>
            <div className="detail-kicker"><span style={{ background: CATEGORY_META[selectedArtifact.category].color }} /> {selectedArtifact.code}</div>
            <div className="detail-title-row"><div><h2>{selectedArtifact.label}</h2><p>{selectedArtifact.meta} · {selectedArtifact.revision ? revision : 'released'}</p></div><button aria-label="Focus selected artifact"><Maximize2 size={15} /></button></div>
            <div className="details-section">
              <div className="eyebrow">PROPERTIES</div>
              <dl>{Object.entries(details).map(([label, value]) => <div key={label}><dt>{label}</dt><dd className={String(value).includes('LOW') ? 'warning' : ''}>{value}</dd></div>)}</dl>
            </div>
            <button className="analyze-button" onClick={() => { setSelectedId('j12'); setImpactOpen(true); }}><Sparkles size={15} /><span><b>Analyze Change</b><small>Replace connector with J14</small></span><ChevronRight size={14} /></button>
            <div className="details-section connected-section">
              <div className="section-heading"><div className="eyebrow">CONNECTED ARTIFACTS · {connectedIds.length}</div></div>
              <div className="connected-list">
                {connectedIds.slice(0, 7).map((id) => {
                  const item = ARTIFACTS.find((node) => node.id === id)!;
                  return <button key={id} onClick={() => chooseNode(id)}><span className="connected-code" style={{ color: CATEGORY_META[item.category].color }}>{item.code.split(' · ')[0]}</span><span><b>{item.label}</b><small>{item.meta}</small></span><ChevronRight size={13} /></button>;
                })}
              </div>
            </div>
          </>
        )}
      </aside>

      <footer className="timeline">
        <div className="timeline-view"><button className="play-button" onClick={runDemo} aria-label="Run demo"><Play size={16} /></button><div><div className="eyebrow">VIEWING</div><strong>{revision} · {revision === 'Rev A' ? 'May 12' : revision === 'Rev B' ? 'Jun 04' : 'Aug 18'}</strong></div></div>
        <div className="timeline-track" aria-label="Product revisions">
          {[['Rev A', 'May 12'], ['Rev B', 'Jun 04'], ['Rev C', 'Aug 18']].map(([rev, date]) => <button key={rev} className={revision === rev ? 'current' : ''} onClick={() => setRevision(rev)}><i /><span>{rev}<small>{date}</small></span></button>)}
        </div>
        <div className="timeline-actions"><span>{REVISION_CHANGES[revision].length} changed</span><button onClick={runDemo} disabled={demoRunning}><Play size={12} /> {demoRunning ? 'Demo running' : 'Run Demo'}</button></div>
      </footer>

      <>
        {impactOpen && (
          <div className="modal-backdrop overlay-enter" onMouseDown={(e) => { if (e.target === e.currentTarget) setImpactOpen(false); }}>
            <section className="impact-modal modal-enter">
              <header><div><div className="eyebrow">CHANGE IMPACT · REV C</div><h2>Replace J12 Connector with J14</h2></div><button onClick={() => setImpactOpen(false)}><X size={17} /></button></header>
              <div className="impact-summary"><div><span>6</span><p><b>artifacts affected</b><small>across 6 engineering domains</small></p></div><span className="risk-badge">RISK · MEDIUM</span></div>
              <div className="impact-items">{IMPACT_ITEMS.map(([label, copy], index) => <div key={label}><span className="impact-index">0{index + 1}</span><div><b>{label}</b><p>{copy}</p></div><Check size={14} /></div>)}</div>
              <footer><span><Activity size={14} /> Estimated blast radius: <b>6 artifacts</b></span><button onClick={() => setImpactOpen(false)}>Keep exploring <ChevronRight size={13} /></button></footer>
            </section>
          </div>
        )}
      </>

      <>
        {searchOpen && (
          <div className="search-overlay overlay-enter" onMouseDown={(e) => { if (e.target === e.currentTarget) setSearchOpen(false); }}>
            <section className="search-enter">
              <label><Search size={17} /><input autoFocus value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search parts, boards, files, suppliers…" /><kbd>ESC</kbd></label>
              <div>{searchResults.map((item) => <button key={item.id} onClick={() => { chooseNode(item.id); setMode('graph'); setSearchOpen(false); }}><span style={{ background: CATEGORY_META[item.category].color }} /><div><b>{item.label}</b><small>{item.code} · {item.meta}</small></div><ChevronRight size={13} /></button>)}</div>
            </section>
          </div>
        )}
      </>

      {demoLabel && <div className="demo-toast toast-enter"><span className={demoRunning ? 'pulse-dot' : 'done-dot'} />{demoLabel}</div>}
    </main>
  );
}

function EvidenceList({ evidence, limit = 3 }: { evidence: AgentResponse['evidence']; limit?: number }) {
  if (!evidence.length) return null;
  return (
    <div className="evidence-list" aria-label="Corpus evidence">
      {evidence.slice(0, limit).map((item) => (
        <div className="evidence-row" key={item.sourceFile}>
          <span>{String(item.score).padStart(2, '0')}</span>
          <div><b>{item.title}</b><small>{item.sourceFile}</small><p>{item.excerpt}</p></div>
        </div>
      ))}
    </div>
  );
}

const AGENT_PROMPTS: Record<AgentKind, string> = {
  product: 'What systems are affected if J12 changes?',
  supply: 'J12 is unavailable. What replacement can we use and what are the tradeoffs?',
  builder: 'Increase payload capacity by 30% using currently available parts. Produce a build/change plan.',
};

function AgentPanel({ onClose, onArtifacts }: { onClose: () => void; onArtifacts: (ids: string[]) => void }) {
  const agents = [
    { kind: 'product' as const, name: 'Product Agent', copy: 'Traces dependencies and revision impact', Icon: Cpu },
    { kind: 'supply' as const, name: 'Supply Agent', copy: 'Checks stock, lead time, and alternatives', Icon: Activity },
    { kind: 'builder' as const, name: 'Builder Agent', copy: 'Creates evidence-backed change plans', Icon: Box },
  ];
  const [activeAgent, setActiveAgent] = useState<AgentKind>('product');
  const [question, setQuestion] = useState(AGENT_PROMPTS.product);
  const [answer, setAnswer] = useState<AgentResponse | null>(null);
  const [health, setHealth] = useState<CorpusHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<CorpusHealth> : Promise.reject(new Error('Corpus unavailable')))
      .then(setHealth)
      .catch((cause: Error) => { if (cause.name !== 'AbortError') setError(cause.message); });
    return () => controller.abort();
  }, []);

  const selectAgent = (agent: AgentKind) => {
    setActiveAgent(agent);
    setQuestion(AGENT_PROMPTS[agent]);
    setAnswer(null);
    setError('');
    onArtifacts([]);
  };

  const submit = async () => {
    if (!question.trim() || loading) return;
    setLoading(true);
    setError('');
    try {
      const result = await askAgent(activeAgent, question.trim());
      setAnswer(result);
      onArtifacts(result.artifactIds);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Agent query failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="agent-panel">
      <div className="mode-panel-head"><div><span className="mode-icon"><Bot size={16} /></span><div><div className="eyebrow">CORPUS RUNTIME</div><h3>Engineering Agents</h3></div></div><button onClick={onClose}><X size={15} /></button></div>
      <p>Each agent uses the committed rover dataset and returns the files and graph artifacts behind its answer.</p>
      <div className={`backend-state ${health ? 'online' : ''}`}><span /><div><b>{health ? 'Corpus backend online' : 'Connecting to corpus...'}</b><small>{health ? `${health.indexedDocuments} indexed documents · ${health.artifacts} artifacts · ${health.scenarios} scenarios` : 'Initializing the local dataset index'}</small></div></div>
      <div className="agent-list">
        {agents.map(({ kind, name, copy, Icon }) => (
          <button className={`agent-card ${activeAgent === kind ? 'active' : ''}`} key={kind} onClick={() => selectAgent(kind)}>
            <span className="agent-icon"><Icon size={16} /></span>
            <span><strong>{name}<b>LIVE</b></strong><small>{copy}</small></span>
            <ChevronRight size={14} />
          </button>
        ))}
      </div>
      <label className="agent-query"><span>ASK {activeAgent.toUpperCase()}</span><textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); } }} /><button disabled={loading} onClick={() => void submit()}><Send size={13} /> {loading ? 'Reading corpus...' : 'Run agent'}</button></label>
      {error && <div className="backend-error">{error}</div>}
      {answer && (
        <div className="agent-response panel-enter">
          <div className="agent-response-head"><span>{answer.mode === 'ground-truth' ? 'VALIDATED ANSWER' : 'CORPUS RETRIEVAL'}</span><b>{Math.round(answer.confidence * 100)}% · {answer.latencyMs}ms</b></div>
          <p>{answer.answer}</p>
          <div className="agent-artifacts">{answer.artifactIds.slice(0, 8).map((id) => <span key={id}>{id}</span>)}</div>
          <EvidenceList evidence={answer.evidence} limit={3} />
        </div>
      )}
      <div className="runtime-note"><Cable size={15} /><div><b>Local-first backend</b><span>No database or cloud model required.</span></div></div>
    </div>
  );
}
