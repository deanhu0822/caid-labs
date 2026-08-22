'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
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
  AlertTriangle,
  Bot,
  Box,
  Cable,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  CircleX,
  Code2,
  Cpu,
  Eye,
  FileImage,
  Film,
  Focus,
  GitBranch,
  Info,
  Layers3,
  Lock,
  Maximize2,
  Plus,
  Play,
  ScanLine,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Wrench,
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
  type Relation,
} from './product-data';
import type { AgentKind, AgentResponse, CorpusHealth } from '@/lib/corpus-types';
import {
  engineeringReducer,
  initialEngineeringState,
  j12ChangeProposal,
  proposalFromAgent,
  type EngineeringConstraint,
  type EngineeringProposal,
  type EngineeringState,
  type ExperienceMode,
  type ValidationStatus,
} from '@/lib/engineering-state';
import { localScannerAdapter, type ScannerAnalysis, type ScannerMatch } from '@/lib/scanner-analysis';
import { DEMO_CODE_PREVIEWS, type DemoCodePreview } from './demo-code';
import { DemoWalkthrough, type DemoRuntime } from './demo-walkthrough';
import { StartFromScratch } from './start-from-scratch';
import type { PrototypeBuildDefinition } from '@/lib/new-build-adapter';
import { DEMO_FEATURES, DEMO_IMPACT_IDS, DEMO_OBJECTIVE, DEMO_STAGES, demoAgentResponse } from '@/lib/demo-walkthrough';

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
  const [engineering, dispatch] = useReducer(engineeringReducer, initialEngineeringState);
  const activeArtifacts: Artifact[] = useMemo(() => engineering.project.kind === 'generated'
    ? engineering.project.build.architecture.artifacts
    : ARTIFACTS, [engineering.project]);
  const activeRelations: Relation[] = useMemo(() => engineering.project.kind === 'generated'
    ? engineering.project.build.architecture.relations
    : RELATIONS, [engineering.project]);
  const [allNodes, setAllNodes, onNodesChange] = useNodesState<ArtifactNode>(initialNodes);
  const [activeCategories, setActiveCategories] = useState<Set<Category>>(new Set(Object.keys(CATEGORY_META) as Category[]));
  const [activeEdges, setActiveEdges] = useState<Set<EdgeKind>>(new Set(Object.keys(EDGE_META) as EdgeKind[]));
  const [mode, setMode] = useState<AppMode>('graph');
  const [impactOpen, setImpactOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [builderQuery, setBuilderQuery] = useState('');
  const [builderLoading, setBuilderLoading] = useState(false);
  const [builderError, setBuilderError] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [codeArtifactId, setCodeArtifactId] = useState<string | null>(null);
  const [demoRuntime, setDemoRuntime] = useState<DemoRuntime>({ active: false, paused: false, step: 0, runId: 0 });
  const [scratchOpen, setScratchOpen] = useState(false);
  const engineeringRef = useRef(engineering);
  const demoRunning = demoRuntime.active;

  useEffect(() => {
    engineeringRef.current = engineering;
  }, [engineering]);

  const selectedId = engineering.selectedArtifactId;
  const revision = engineering.viewingRevision;
  const proposal = engineering.proposal;
  const scannerMatched = engineering.scannerObservation?.status === 'matched';
  const revisionRecord = engineering.revisions.find((item) => item.id === revision);

  useEffect(() => {
    setAllNodes(activeArtifacts.map((artifact) => ({
      id: artifact.id,
      type: 'artifact',
      position: { x: artifact.x, y: artifact.y },
      data: { ...artifact, activeRevision: engineering.currentRevision },
    })));
  }, [activeArtifacts, engineering.currentRevision, setAllNodes]);

  const selectedArtifactBase = activeArtifacts.find((node) => node.id === selectedId) ?? activeArtifacts[0];
  const selectedArtifact = { ...selectedArtifactBase, ...revisionRecord?.artifactOverrides?.[selectedArtifactBase.id] };

  const connectedIds = useMemo(() => {
    const ids = new Set<string>();
    activeRelations.forEach((edge) => {
      if (edge.source === selectedId) ids.add(edge.target);
      if (edge.target === selectedId) ids.add(edge.source);
    });
    return [...ids];
  }, [activeRelations, selectedId]);

  const highlighted = useMemo(() => {
    if (engineering.project.kind === 'existing' && impactOpen) return new Set(J12_BLAST);
    if (engineering.focusArtifactIds.length) return new Set(engineering.focusArtifactIds);
    if (mode === 'builder' && proposal) return new Set(proposal.affectedArtifactIds.length ? proposal.affectedArtifactIds : BUILDER_BLAST);
    if (engineering.project.kind === 'existing' && mode === 'scanner' && scannerMatched) return new Set(J12_BLAST);
    if (engineering.project.kind === 'existing' && selectedId === 'j12') return new Set(J12_BLAST);
    return new Set([selectedId, ...connectedIds]);
  }, [connectedIds, engineering.focusArtifactIds, engineering.project.kind, impactOpen, mode, proposal, scannerMatched, selectedId]);

  const visibleNodes = useMemo(() => allNodes
    .filter((node) => activeCategories.has(node.data.category))
    .map((node) => {
      const isHighlighted = highlighted.has(node.id);
      const isChanged = (revisionRecord?.changedArtifactIds ?? REVISION_CHANGES[revision] ?? []).includes(node.id);
      const override = revisionRecord?.artifactOverrides?.[node.id];
      return {
        ...node,
        data: { ...node.data, ...override, activeRevision: revision },
        selected: node.id === selectedId,
        className: [
          `artifact-node category-${node.data.category}`,
          isHighlighted ? 'is-highlighted' : 'is-dimmed',
          isChanged ? 'is-changed' : '',
        ].join(' '),
      };
    }), [activeCategories, allNodes, highlighted, revision, revisionRecord, selectedId]);

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleEdges = useMemo(() => activeRelations
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
    }), [activeEdges, activeRelations, highlighted, visibleNodeIds]);

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
    const artifact = activeArtifacts.find((item) => item.id === id);
    if (!artifact) return;
    dispatch({ type: 'SELECT_ARTIFACT', artifactId: id });
    setCodeArtifactId(DEMO_CODE_PREVIEWS[id] ? id : null);
    if (!activeCategories.has(artifact.category)) {
      setActiveCategories((current) => new Set([...current, artifact.category]));
    }
  };

  const runBuilder = async (query = builderQuery) => {
    const objective = (query || 'Increase payload capacity').trim();
    setBuilderQuery(objective);
    dispatch({ type: 'SET_OBJECTIVE', objective });
    setBuilderError('');
    setBuilderLoading(true);
    if (engineering.project.kind === 'generated') {
      await sleep(350);
      setBuilderError('New-build change proposals are a front-end prototype. Choose the next architecture decision in Beginner; the shared graph will stay synchronized.');
      setBuilderLoading(false);
      return;
    }
    try {
      const result = await askAgent('builder', objective);
      const nextProposal = proposalFromAgent(result, { ...engineering, objective });
      dispatch({ type: 'SET_PROPOSAL', proposal: nextProposal });
      const firstVisibleId = result.artifactIds.find((id) => activeArtifacts.some((artifact) => artifact.id === id));
      if (firstVisibleId) dispatch({ type: 'SELECT_ARTIFACT', artifactId: firstVisibleId });
    } catch (error) {
      setBuilderError(error instanceof Error ? error.message : 'Builder query failed.');
    } finally {
      setBuilderLoading(false);
    }
  };

  const applyDemoStage = useCallback((step: number) => {
    const stage = DEMO_STAGES[step];
    if (!stage) return;

    if (stage.phase === 'intent') {
      dispatch({ type: 'RESET_TO_EXISTING' });
      dispatch({ type: 'SET_EXPERIENCE', mode: 'guided' });
      dispatch({ type: 'SET_OBJECTIVE', objective: DEMO_OBJECTIVE });
      dispatch({ type: 'SET_FOCUS', artifactIds: [] });
      dispatch({ type: 'SELECT_ARTIFACT', artifactId: 'rover' });
      setBuilderQuery(DEMO_OBJECTIVE);
      setMode('builder');
    } else if (stage.phase === 'constraints') {
      DEMO_FEATURES.clarify_constraints.resolved_constraints.forEach((constraint) => {
        dispatch({
          type: 'SET_CONSTRAINT',
          constraint: {
            key: constraint.key === 'chassis' ? 'fixed:chassis' : constraint.key,
            label: constraint.key === 'payload' ? 'Payload target' : constraint.key === 'chassis' ? 'Keep component' : 'Form factor',
            value: constraint.value,
            unit: 'unit' in constraint ? constraint.unit : undefined,
            source: 'guided',
          },
        });
      });
      dispatch({ type: 'SET_FOCUS', artifactIds: ['chassis'] });
      dispatch({ type: 'SELECT_ARTIFACT', artifactId: 'chassis' });
      setMode('builder');
    } else if (stage.phase === 'graph') {
      dispatch({ type: 'SET_EXPERIENCE', mode: 'pro' });
      dispatch({ type: 'SET_FOCUS', artifactIds: [...DEMO_IMPACT_IDS] });
      dispatch({ type: 'SELECT_ARTIFACT', artifactId: 'motor-bom' });
      setMode('graph');
    } else if (stage.phase === 'candidate') {
      const nextProposal = proposalFromAgent(demoAgentResponse(), engineeringRef.current);
      dispatch({ type: 'SET_PROPOSAL', proposal: nextProposal });
      dispatch({ type: 'SELECT_ARTIFACT', artifactId: 'motor-bom' });
      setMode('graph');
    } else if (stage.phase === 'validation') {
      setMode('builder');
      dispatch({ type: 'SET_EXPERIENCE', mode: 'pro' });
    } else if (stage.phase === 'revision') {
      dispatch({ type: 'ACCEPT_PROPOSAL' });
      setMode('graph');
    } else if (stage.phase === 'guided') {
      dispatch({ type: 'SET_EXPERIENCE', mode: 'guided' });
      setMode('builder');
    } else if (stage.phase === 'pro') {
      dispatch({ type: 'SET_EXPERIENCE', mode: 'pro' });
      setMode('builder');
    }
  }, []);

  const startDemo = () => {
    setCodeArtifactId(null);
    setBuilderError('');
    setImpactOpen(false);
    setHowOpen(false);
    setScratchOpen(false);
    applyDemoStage(0);
    setDemoRuntime((current) => ({ active: true, paused: false, step: 0, runId: current.runId + 1 }));
  };

  const skipDemoStage = () => {
    const nextStep = Math.min(demoRuntime.step + 1, DEMO_STAGES.length - 1);
    applyDemoStage(nextStep);
    setDemoRuntime((current) => ({ ...current, paused: false, step: nextStep }));
  };

  useEffect(() => {
    if (!demoRuntime.active || demoRuntime.paused) return;
    const stage = DEMO_STAGES[demoRuntime.step];
    if (!stage || stage.durationMs <= 0) return;
    const timeout = window.setTimeout(() => {
      const nextStep = Math.min(demoRuntime.step + 1, DEMO_STAGES.length - 1);
      applyDemoStage(nextStep);
      setDemoRuntime((current) => current.active && current.step === demoRuntime.step ? { ...current, step: nextStep } : current);
    }, stage.durationMs);
    return () => window.clearTimeout(timeout);
  }, [applyDemoStage, demoRuntime.active, demoRuntime.paused, demoRuntime.runId, demoRuntime.step]);

  const baseDetails = DETAIL_OVERRIDES[selectedId] ?? {
    Type: CATEGORY_META[selectedArtifact.category].label,
    Revision: revision,
    Identifier: selectedArtifact.meta,
    Status: selectedArtifact.category === 'agents' ? 'LOCAL' : 'Released',
  };
  const selectedMutation = revisionRecord?.mutations?.find((change) => change.artifactId === selectedId);
  const details = selectedMutation ? {
    ...baseDetails,
    Revision: engineering.currentRevision,
    Status: 'Changed in current revision',
    Previous: selectedMutation.before,
    Current: selectedMutation.after,
  } : baseDetails;

  const searchResults = searchTerm.trim()
    ? activeArtifacts.filter((node) => `${node.label} ${node.meta}`.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 7)
    : activeArtifacts.slice(0, 7);

  const revisionChanges = revisionRecord?.changedArtifactIds ?? REVISION_CHANGES[revision] ?? [];

  const analyzeJ12Change = () => {
    setCodeArtifactId(null);
    const nextProposal = j12ChangeProposal(engineering);
    dispatch({ type: 'SET_PROPOSAL', proposal: nextProposal });
    dispatch({ type: 'SELECT_ARTIFACT', artifactId: 'j12' });
    setImpactOpen(true);
  };

  const setConstraint = (constraint: EngineeringConstraint) => dispatch({ type: 'SET_CONSTRAINT', constraint });

  const switchExperience = (experienceMode: ExperienceMode) => {
    dispatch({ type: 'SET_EXPERIENCE', mode: experienceMode });
    if (experienceMode === 'guided' && mode === 'agents') setMode('builder');
  };

  const createNewBuild = (build: PrototypeBuildDefinition) => {
    dispatch({ type: 'CREATE_NEW_BUILD', build });
    setMode('graph');
    setCodeArtifactId(null);
    setImpactOpen(false);
    setBuilderError('');
    setScratchOpen(false);
  };

  const openExistingBuild = () => {
    dispatch({ type: 'RESET_TO_EXISTING' });
    setMode('graph');
    setCodeArtifactId(null);
    setImpactOpen(false);
    setBuilderError('');
  };

  return (
    <main className={`app-shell ${engineering.experienceMode}-experience`}>
      <header className="topbar">
        <div className="brand-mark"><GitBranch size={16} /></div>
        <div className="brand">FORMA LABS <span>/</span> {engineering.project.id} <span>/</span> {revision.toLowerCase().replace(' ', '-')}</div>
        <div className="experience-switch" aria-label="Experience mode">
          <button aria-label="Beginner mode" className={engineering.experienceMode === 'guided' ? 'active' : ''} onClick={() => switchExperience('guided')}><Sparkles size={12} /><span><b>Beginner</b><small>Step-by-step workflow</small></span></button>
          <button aria-label="Pro mode" className={engineering.experienceMode === 'pro' ? 'active' : ''} onClick={() => switchExperience('pro')}><SlidersHorizontal size={12} /><span><b>Pro</b><small>Engineering workspace</small></span></button>
        </div>
        <nav aria-label="Workspace modes">
          {(['graph', 'builder', 'scanner'] as AppMode[]).map((item) => (
            <button key={item} className={mode === item ? 'active' : ''} onClick={() => { setMode(item); setCodeArtifactId(null); }}>
              {item === 'graph' ? <Layers3 size={14} /> : item === 'builder' ? <Sparkles size={14} /> : <ScanLine size={14} />}
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
          <button className={mode === 'agents' ? 'active' : ''} onClick={() => { setMode('agents'); setCodeArtifactId(null); }}><Bot size={14} /> Agents</button>
        </nav>
        <div className="header-actions">
          <div className="header-search" onFocus={() => setSearchOpen(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as HTMLElement | null)) setSearchOpen(false); }}>
            <Search size={14} />
            <input
              aria-label="Search artifacts"
              value={searchTerm}
              onChange={(event) => { setSearchTerm(event.target.value); setSearchOpen(true); }}
              onKeyDown={(event) => { if (event.key === 'Escape') { setSearchOpen(false); event.currentTarget.blur(); } }}
              placeholder="Search artifacts"
            />
            {searchTerm && <button aria-label="Clear search" onMouseDown={(event) => event.preventDefault()} onClick={() => setSearchTerm('')}><X size={12} /></button>}
            {searchOpen && (
              <div className="header-search-results">
                {searchResults.length ? searchResults.map((item) => <button key={item.id} onClick={() => { chooseNode(item.id); setMode('graph'); setSearchOpen(false); }}><span style={{ background: CATEGORY_META[item.category].color }} /><div><b>{item.label}</b><small>{item.code} · {item.meta}</small></div><ChevronRight size={13} /></button>) : <p>No matching artifacts</p>}
              </div>
            )}
          </div>
          {engineering.project.kind === 'existing'
            ? <button aria-label="Start from Scratch" className="new-build-button" onClick={() => setScratchOpen(true)}><Plus size={14} /> <span>Start from Scratch</span></button>
            : <button aria-label="Open existing rover-alpha build" className="new-build-button existing" onClick={openExistingBuild}><GitBranch size={14} /> <span>Open rover-alpha</span></button>}
          <button className="how-button" onClick={() => setHowOpen(true)}><Info size={14} /> <span>How it works</span></button>
          <button className="demo-top" onClick={startDemo} disabled={demoRunning || engineering.project.kind === 'generated'}><Play size={14} /> {demoRunning ? 'Running…' : 'Run Demo'}</button>
          <button className="accent" onClick={() => { setMode('builder'); setBuilderError(''); }}><Sparkles size={15} /> Builder</button>
        </div>
      </header>

      <aside className="sidebar">
        {engineering.experienceMode === 'guided' ? (
          <GuidedRail state={engineering} onConstraint={setConstraint} />
        ) : (
          <>
        <div className="side-heading"><div className="eyebrow">PRODUCT GRAPH</div><span>{activeArtifacts.length} artifacts</span></div>
        <div className="filter-group">
          {(Object.keys(CATEGORY_META) as Category[]).map((category) => {
            const meta = CATEGORY_META[category];
            const count = activeArtifacts.filter((node) => node.category === category).length;
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
          </>
        )}
      </aside>

      <section className="graph-stage">
        <div className="graph-meta">
          <span>{engineering.project.name}</span>
          <small>{revision.toUpperCase()} · {revision === engineering.currentRevision ? 'CURRENT REVISION' : 'HISTORICAL REVISION'} · {activeArtifacts.length} ARTIFACTS · {activeRelations.length} RELATIONSHIPS</small>
        </div>
        <div className="blast-legend"><span className="pulse-dot" /> {highlighted.size} related artifacts highlighted</div>
        <ReactFlow
          nodes={visibleNodes}
          edges={visibleEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={(_, node) => chooseNode(node.id)}
          onPaneClick={() => { if (!impactOpen && mode === 'graph') dispatch({ type: 'SET_FOCUS', artifactIds: [] }); }}
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

        <div className="graph-hint"><Focus size={13} /> Scroll to zoom · drag to pan · click an artifact to inspect it</div>

        <>
          {mode === 'graph' && codeArtifactId && DEMO_CODE_PREVIEWS[codeArtifactId] && (
            <DemoCodePanel
              artifactLabel={activeArtifacts.find((artifact) => artifact.id === codeArtifactId)?.label ?? codeArtifactId}
              preview={DEMO_CODE_PREVIEWS[codeArtifactId]}
              onClose={() => setCodeArtifactId(null)}
            />
          )}
          {mode === 'builder' && (
            <section className="mode-panel builder-panel panel-enter" key="builder">
              <div className="mode-panel-head"><div><span className="mode-icon"><Sparkles size={15} /></span><div><div className="eyebrow">CHANGE REQUEST</div><h3>Builder</h3></div></div><button onClick={() => setMode('graph')}><X size={15} /></button></div>
              <p>Describe the desired result. Builder checks dependencies and validation rules before proposing edits.</p>
              {engineering.experienceMode === 'pro' && <ProConstraintEditor state={engineering} selectedArtifact={selectedArtifact} onConstraint={setConstraint} onToggleFixed={(artifactId) => dispatch({ type: 'TOGGLE_FIXED_ARTIFACT', artifactId })} />}
              <label className="builder-input"><input value={builderQuery} onChange={(e) => setBuilderQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void runBuilder(); } }} placeholder="What are you trying to build or change?" /><button disabled={builderLoading} onClick={() => void runBuilder()} aria-label="Ask Builder"><Send size={14} /></button></label>
              <div className="suggestions">{BUILDER_SUGGESTIONS.map((suggestion) => <button key={suggestion} disabled={builderLoading} onClick={() => void runBuilder(suggestion)}>{suggestion}</button>)}</div>
              {builderLoading && <div className="backend-loading"><span className="pulse-dot" /> Checking project files and dependencies...</div>}
              {builderError && <div className="backend-error">{builderError}</div>}
              {proposal && <ProposalCard proposal={proposal} experience={engineering.experienceMode} onAccept={() => dispatch({ type: 'ACCEPT_PROPOSAL' })} onShowGraph={() => setMode('graph')} onShowPro={() => switchExperience('pro')} />}
            </section>
          )}

          {mode === 'scanner' && (
            <ScannerPanel
              revision={engineering.currentRevision}
              observation={engineering.scannerObservation}
              fixedArtifactIds={engineering.fixedArtifactIds}
              artifacts={activeArtifacts}
              generated={engineering.project.kind === 'generated'}
              onClose={() => setMode('graph')}
              onObservation={(observation) => dispatch({ type: 'SET_SCANNER_OBSERVATION', observation })}
              onToggleFixed={(artifactId) => dispatch({ type: 'TOGGLE_FIXED_ARTIFACT', artifactId })}
            />
          )}
        </>
      </section>

      <aside className={`details ${mode === 'agents' ? 'agents-open' : ''} ${engineering.experienceMode === 'guided' && mode !== 'scanner' ? 'guided-open' : ''}`}>
        {engineering.experienceMode === 'guided' ? (
          <GuidedPanel
            state={engineering}
            query={builderQuery}
            loading={builderLoading}
            error={builderError}
            onQuery={setBuilderQuery}
            onRun={(query) => { setMode('builder'); void runBuilder(query); }}
            onAccept={() => dispatch({ type: 'ACCEPT_PROPOSAL' })}
            onShowPro={() => switchExperience('pro')}
            onOpenScanner={() => setMode('scanner')}
            onAnalyzeJ12={analyzeJ12Change}
            onConstraint={setConstraint}
          />
        ) : mode === 'agents' ? (
          <AgentPanel
            onClose={() => setMode('graph')}
            onArtifacts={(ids) => {
              dispatch({ type: 'SET_FOCUS', artifactIds: ids });
              const firstVisibleId = ids.find((id) => activeArtifacts.some((artifact) => artifact.id === id));
              if (firstVisibleId) dispatch({ type: 'SELECT_ARTIFACT', artifactId: firstVisibleId });
            }}
          />
        ) : (
          <>
            <div className="detail-kicker"><span style={{ background: CATEGORY_META[selectedArtifact.category].color }} /> {selectedArtifact.code}</div>
            <div className="detail-title-row"><div><h2>{selectedArtifact.label}</h2><p>{selectedArtifact.meta} · {selectedMutation ? `${revision} current` : selectedArtifact.revision ? revision : 'released'}</p></div><button aria-label="Focus selected artifact"><Maximize2 size={15} /></button></div>
            <div className="details-section">
              <div className="eyebrow">PROPERTIES</div>
              <dl>{Object.entries(details).map(([label, value]) => <div key={label}><dt>{label}</dt><dd className={String(value).includes('LOW') ? 'warning' : ''}>{value}</dd></div>)}</dl>
            </div>
            {engineering.project.kind === 'existing'
              ? <button className="analyze-button" onClick={analyzeJ12Change}><Sparkles size={15} /><span><b>Analyze Change</b><small>Replace connector with available alternate</small></span><ChevronRight size={14} /></button>
              : <button className="analyze-button" onClick={() => switchExperience('guided')}><Sparkles size={15} /><span><b>Choose next decision</b><small>{engineering.project.build.architecture.nextDecision.title}</small></span><ChevronRight size={14} /></button>}
            {engineering.project.kind === 'generated' && <InputSourcesPanel build={engineering.project.build} />}
            <div className="details-section connected-section">
              <div className="section-heading"><div className="eyebrow">CONNECTED ARTIFACTS · {connectedIds.length}</div></div>
              <div className="connected-list">
                {connectedIds.slice(0, 7).map((id) => {
                  const item = activeArtifacts.find((node) => node.id === id)!;
                  return <button key={id} onClick={() => chooseNode(id)}><span className="connected-code" style={{ color: CATEGORY_META[item.category].color }}>{item.code.split(' · ')[0]}</span><span><b>{item.label}</b><small>{item.meta}</small></span><ChevronRight size={13} /></button>;
                })}
              </div>
            </div>
          </>
        )}
      </aside>

      <footer className="timeline">
        <div className="timeline-view"><button className="play-button" onClick={startDemo} disabled={demoRunning || engineering.project.kind === 'generated'} aria-label="Run demo"><Play size={16} /></button><div><div className="eyebrow">VIEWING {revision === engineering.currentRevision ? 'CURRENT' : 'HISTORY'}</div><strong>{revision} · {revisionRecord?.date ?? 'Now'}</strong></div></div>
        <div className="timeline-track" aria-label="Product revisions">
          {engineering.revisions.map((item) => <button key={item.id} className={revision === item.id ? 'current' : ''} onClick={() => dispatch({ type: 'SET_VIEWING_REVISION', revision: item.id })}><i /><span>{item.id}<small>{item.date}</small></span></button>)}
        </div>
        <div className="timeline-actions"><span>{revisionChanges.length} changed · {engineering.currentRevision} current</span><button onClick={startDemo} disabled={demoRunning || engineering.project.kind === 'generated'}><Play size={12} /> {demoRunning ? 'Demo running' : 'Run Demo'}</button></div>
      </footer>

      <>
        {impactOpen && (
          <div className="modal-backdrop overlay-enter" onMouseDown={(e) => { if (e.target === e.currentTarget) setImpactOpen(false); }}>
            <section className="impact-modal modal-enter">
              <header><div><div className="eyebrow">CHANGE IMPACT · {engineering.currentRevision}</div><h2>{proposal?.title ?? 'Replace J12 Connector'}</h2></div><button onClick={() => setImpactOpen(false)}><X size={17} /></button></header>
              <div className="impact-summary"><div><span>{proposal?.affectedArtifactIds.length ?? 6}</span><p><b>artifacts affected</b><small>only required edits are listed</small></p></div><span className="risk-badge">REVIEW VALIDATION</span></div>
              <div className="impact-items">{proposal?.changed.length ? proposal.changed.map((change, index) => <div key={change.artifactId}><span className="impact-index">0{index + 1}</span><div><b>{change.before} → {change.after}</b><p>{change.reason}</p></div><Check size={14} /></div>) : IMPACT_ITEMS.map(([label, copy], index) => <div key={label}><span className="impact-index">0{index + 1}</span><div><b>{label}</b><p>{copy}</p></div><Check size={14} /></div>)}</div>
              <footer><span><Activity size={14} /> Objects not listed above are unchanged.</span><div><button onClick={() => { setImpactOpen(false); switchExperience('guided'); }}>Open Beginner <ChevronRight size={13} /></button><button onClick={() => setImpactOpen(false)}>Close</button></div></footer>
            </section>
          </div>
        )}
      </>

      {howOpen && (
        <div className="modal-backdrop overlay-enter" onMouseDown={(event) => { if (event.target === event.currentTarget) setHowOpen(false); }}>
          <section className="how-modal modal-enter">
            <header><div><div className="eyebrow">CHANGE WORKFLOW</div><h2>How Forma Labs works</h2></div><button onClick={() => setHowOpen(false)}><X size={17} /></button></header>
            <p>Beginner and Pro use the same project data. Beginner summarizes a proposed change; Pro shows its edits, checks, and source files.</p>
            <div className="forma-flow">
              {['Change request', 'Project data', 'Dependencies', 'Proposed edits', 'Validation checks', 'New revision', 'Updated graph'].map((label, index) => <div key={label}><span>{String(index + 1).padStart(2, '0')}</span><b>{label}</b>{index < 6 && <ChevronRight size={13} />}</div>)}
            </div>
            <div className="view-branches"><div><Sparkles size={16} /><b>Beginner</b><span>Summary, choices, and next step</span></div><div><SlidersHorizontal size={16} /><b>Pro</b><span>Edits, calculations, dependencies, and sources</span></div></div>
            <div className="opencad-principle"><Wrench size={15} /><p><b>CAD export is not connected.</b><span>Forma Labs prepares an OpenCAD handoff, but it does not modify CAD files.</span></p></div>
          </section>
        </div>
      )}

      {scratchOpen && <StartFromScratch onClose={() => setScratchOpen(false)} onCreate={createNewBuild} />}
      <DemoWalkthrough
        runtime={demoRuntime}
        revision={engineering.currentRevision}
        onPause={() => setDemoRuntime((current) => ({ ...current, paused: !current.paused }))}
        onRestart={startDemo}
        onSkip={skipDemoStage}
        onExit={() => setDemoRuntime((current) => ({ ...current, active: false, paused: false }))}
      />
    </main>
  );
}

function artifactLabel(id: string) {
  return ARTIFACTS.find((artifact) => artifact.id === id)?.label ?? id;
}

function DemoCodePanel({ artifactLabel: label, preview, onClose }: { artifactLabel: string; preview: DemoCodePreview; onClose: () => void }) {
  return (
    <section className="mode-panel code-panel panel-enter">
      <div className="mode-panel-head"><div><span className="mode-icon"><Code2 size={16} /></span><div><div className="eyebrow">DEMO CODE · HYPOTHETICAL</div><h3>{label}</h3></div></div><button aria-label="Close code preview" onClick={onClose}><X size={15} /></button></div>
      <p>{preview.description}</p>
      <div className="code-file-meta"><span>{preview.filename}</span><span>{preview.language}</span><span>Example only</span></div>
      <div className="demo-code-lines" aria-label={`Hypothetical code for ${label}`}>
        {preview.code.split('\n').map((line, index) => <div key={`${index}-${line}`}><span>{String(index + 1).padStart(2, '0')}</span><code>{line || ' '}</code></div>)}
      </div>
    </section>
  );
}

function GuidedRail({ state, onConstraint }: { state: EngineeringState; onConstraint: (constraint: EngineeringConstraint) => void }) {
  const priority = state.constraints.find((constraint) => constraint.key === 'priority')?.value;
  if (state.project.kind === 'generated') {
    const build = state.project.build;
    const driveDecision = state.constraints.find((constraint) => constraint.key === 'architecture-decision')?.value;
    return (
      <div className="guided-rail generated-rail">
        <div className="side-heading"><div className="eyebrow">YOUR BUILD</div><span>{state.currentRevision}</span></div>
        <div className="guided-progress"><i className="done" /><i className="done" /><i className={driveDecision ? 'done' : 'active'} /></div>
        <div className="guided-step-copy"><b>{driveDecision ? 'First decision captured' : 'Architecture created'}</b><span>{driveDecision ? `${driveDecision} is stored in the shared project state.` : build.intent.goalSummary}</span></div>
        <div className="scratch-goal-summary"><span>CURRENT GOAL</span><b>{build.intent.buildGoal}</b><small>{build.originalPrompt}</small></div>
        <div className="guided-choice-group"><div className="eyebrow">DESIGN PRIORITY</div>{['Balanced performance', 'Longer runtime', 'Higher payload'].map((value) => <button key={value} className={priority === value ? 'active' : ''} onClick={() => onConstraint({ key: 'priority', label: 'Design priority', value, source: 'guided' })}>{value}<ChevronRight size={12} /></button>)}</div>
        <div className="source-count"><FileImage size={13} /><span><b>{build.sources.length} input source{build.sources.length === 1 ? '' : 's'}</b>Prompt, media, and constraints retained</span></div>
        <div className="sidebar-note"><CircleDot size={14} /><span><strong>Shared project state</strong>Beginner and Pro stay in sync</span></div>
      </div>
    );
  }
  return (
    <div className="guided-rail">
      <div className="side-heading"><div className="eyebrow">BEGINNER BUILD</div><span>{state.currentRevision}</span></div>
      <div className="guided-progress"><i className="done" /><i className={state.proposal ? 'done' : 'active'} /><i className={state.proposal?.status === 'accepted' ? 'done' : ''} /></div>
      <div className="guided-step-copy"><b>{state.proposal?.status === 'accepted' ? 'Revision created' : state.proposal ? 'Proposal ready' : 'Define your goal'}</b><span>{state.proposal?.status === 'accepted' ? `${state.currentRevision} is now the current revision.` : state.proposal ? 'Review the required edits and validation checks.' : 'Forma Labs will check affected parts, files, and constraints.'}</span></div>
      <div className="guided-choice-group"><div className="eyebrow">WHAT MATTERS MOST?</div>{['Balanced', 'Longer runtime', 'Lower cost'].map((value) => <button key={value} className={priority === value ? 'active' : ''} onClick={() => onConstraint({ key: 'priority', label: 'Design priority', value, source: 'guided' })}>{value}<ChevronRight size={12} /></button>)}</div>
      {state.constraints.length > 0 && <div className="constraint-summary"><div className="eyebrow">ACTIVE CONSTRAINTS</div>{state.constraints.map((constraint) => <span key={constraint.key}><Lock size={9} /> {constraint.label}: <b>{constraint.value}{constraint.unit ? ` ${constraint.unit}` : ''}</b></span>)}</div>}
      {state.scannerObservation && <div className="physical-observation"><Camera size={14} /><div><b>Physical observation</b><span>{state.scannerObservation.label} linked to graph</span></div></div>}
      <div className="sidebar-note"><CircleDot size={14} /><span><strong>Shared project state</strong>Beginner and Pro stay in sync</span></div>
    </div>
  );
}

function GuidedPanel({ state, query, loading, error, onQuery, onRun, onAccept, onShowPro, onOpenScanner, onAnalyzeJ12, onConstraint }: {
  state: EngineeringState;
  query: string;
  loading: boolean;
  error: string;
  onQuery: (query: string) => void;
  onRun: (query: string) => void;
  onAccept: () => void;
  onShowPro: () => void;
  onOpenScanner: () => void;
  onAnalyzeJ12: () => void;
  onConstraint: (constraint: EngineeringConstraint) => void;
}) {
  const [showWhy, setShowWhy] = useState(false);
  if (state.project.kind === 'generated') {
    const build = state.project.build;
    const decision = build.architecture.nextDecision;
    const selectedDecision = state.constraints.find((constraint) => constraint.key === 'architecture-decision')?.value;
    return (
      <div className="guided-panel scratch-guided-panel">
        <div className="mode-panel-head"><div><span className="mode-icon"><Sparkles size={16} /></span><div><div className="eyebrow">YOUR BUILD · {state.currentRevision.toUpperCase()}</div><h3>Beginner</h3></div></div><button onClick={onShowPro} aria-label="Open Pro workspace"><SlidersHorizontal size={15} /></button></div>
        <div className="guided-hero created"><span>ARCHITECTURE CREATED</span><h2>{build.displayName}</h2><p>{build.intent.goalSummary}</p></div>
        <div className="next-decision-card">
          <div><span>NEXT DECISION</span><h3>{decision.title}</h3><p>{decision.description}</p></div>
          <div className="decision-options">{decision.options.map((option) => <button className={selectedDecision === option.label ? 'active' : ''} key={option.id} onClick={() => onConstraint({ key: 'architecture-decision', label: decision.title, value: option.label, source: 'guided' })}><span><b>{option.label}</b><small>{option.description}</small></span>{selectedDecision === option.label ? <Check size={13} /> : <ChevronRight size={13} />}</button>)}</div>
        </div>
        <div className="generated-build-facts"><span><b>{build.architecture.artifacts.length}</b> concept artifacts</span><span><b>{build.architecture.relations.length}</b> relationships</span><span><b>{build.sources.length}</b> media sources</span></div>
        <div className="guided-actions"><button className="primary" onClick={onShowPro}><Eye size={13} /> Review full graph in Pro</button></div>
        <button className="scanner-entry" onClick={onOpenScanner}><Camera size={15} /><span><b>Add a physical reference</b><small>Take a photo, upload a photo, or upload a video</small></span><ChevronRight size={13} /></button>
        <div className="demo-mode-note"><b>Prototype state</b><span>This architecture is deterministic demo data. No engineering inference or CAD generation was claimed.</span></div>
      </div>
    );
  }
  const proposal = state.proposal;
  const changedLabels = proposal?.changed.map((change) => artifactLabel(change.artifactId)) ?? [];
  const preservedLabels = proposal?.preservedArtifactIds.map(artifactLabel) ?? [];
  const accepted = proposal?.status === 'accepted';
  const rejected = proposal?.status === 'rejected';

  return (
    <div className="guided-panel">
      <div className="mode-panel-head"><div><span className="mode-icon"><Sparkles size={16} /></span><div><div className="eyebrow">STEP-BY-STEP WORKFLOW</div><h3>Beginner</h3></div></div><button onClick={onShowPro} aria-label="Open Pro workspace"><SlidersHorizontal size={15} /></button></div>
      {!proposal ? (
        <>
          <div className="guided-hero"><span>STEP 1 · REQUEST</span><h2>What do you want the rover to achieve?</h2><p>Describe the result. Forma Labs checks which parts, files, and constraints are affected.</p></div>
          <label className="guided-objective"><textarea value={query} onChange={(event) => onQuery(event.target.value)} placeholder="For example: Increase payload by 30%" /><button disabled={loading} onClick={() => onRun(query || 'Increase payload capacity')}><Sparkles size={14} /> {loading ? 'Checking project data…' : 'Generate change proposal'}</button></label>
          <div className="guided-examples"><button onClick={() => { onQuery('Increase payload capacity'); onRun('Increase payload capacity'); }}>Increase payload 30% <ChevronRight size={12} /></button><button onClick={() => { onQuery('Increase runtime to 4 hours without changing mission duty cycle.'); onRun('Increase runtime to 4 hours without changing mission duty cycle.'); }}>Reach four-hour runtime <ChevronRight size={12} /></button><button onClick={onAnalyzeJ12}>Replace unavailable J12 <ChevronRight size={12} /></button></div>
          {error && <div className="backend-error">{error}</div>}
          <button className="scanner-entry" onClick={onOpenScanner}><Camera size={15} /><span><b>Start from a physical part</b><small>Take a photo or upload an image</small></span><ChevronRight size={13} /></button>
        </>
      ) : (
        <>
          <div className={`guided-decision ${accepted ? 'accepted' : ''} ${rejected ? 'rejected' : ''}`}>
            <div className="guided-decision-status">{rejected ? <CircleX size={15} /> : <ShieldCheck size={15} />}<span>{rejected ? 'CONSTRAINT CONFLICT' : accepted ? `${proposal.targetRevision.toUpperCase()} CREATED` : 'PROPOSAL READY'}</span></div>
            <h2>{proposal.title}</h2>
            <p>{proposal.summary}</p>
            {!rejected && <div className="guided-tradeoff"><b>Tradeoff</b><span>{proposal.tradeoff}</span></div>}
            {rejected && <div className="guided-tradeoff danger"><b>Why it stopped</b><span>{proposal.why}</span></div>}
          </div>
          <div className="guided-section"><div className="eyebrow">WHAT CHANGES</div><div className="guided-object-list">{changedLabels.length ? changedLabels.map((label) => <span key={label}><Check size={11} />{label}</span>) : <span><CircleX size={11} />No changes proposed</span>}</div></div>
          <div className="guided-section preserved"><div className="eyebrow">WHAT STAYS THE SAME</div><p>{preservedLabels.slice(0, 5).join(', ') || 'No other artifacts change.'}</p></div>
          {showWhy && <div className="guided-why panel-enter"><b>Why this change?</b><p>{proposal.why}</p><b>Next action</b><p>{proposal.nextAction}</p></div>}
          <div className="guided-actions">
            {proposal.status === 'validated' && <button className="primary" onClick={onAccept}><Check size={13} /> Accept and create {proposal.targetRevision}</button>}
            {accepted && <button className="primary" onClick={onShowPro}><Eye size={13} /> Inspect {state.currentRevision} in Pro</button>}
            {rejected && <button className="primary" onClick={onShowPro}><SlidersHorizontal size={13} /> Resolve fixed constraint in Pro</button>}
            <button onClick={() => onRun('Increase runtime to 4 hours without changing mission duty cycle.')}><Activity size={13} /> Check runtime alternative</button>
            <button onClick={() => setShowWhy((value) => !value)}><Info size={13} /> {showWhy ? 'Hide explanation' : 'Why?'}</button>
            <button onClick={onShowPro}><SlidersHorizontal size={13} /> Technical details</button>
          </div>
          <label className="guided-feedback"><span>REFINE THIS CHANGE</span><div><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Add another requirement…" /><button disabled={loading} onClick={() => onRun(query)}><Send size={12} /></button></div></label>
          <button className="scanner-entry" onClick={onOpenScanner}><Camera size={15} /><span><b>Add a physical constraint</b><small>Choose a confirmed part to keep unchanged</small></span><ChevronRight size={13} /></button>
        </>
      )}
    </div>
  );
}

function InputSourcesPanel({ build }: { build: PrototypeBuildDefinition }) {
  return (
    <div className="details-section input-sources-section">
      <div className="section-heading"><div className="eyebrow">INPUT SOURCES · {build.sources.length + 1}</div><span>Rev A</span></div>
      <div className="original-prompt"><span>ORIGINAL PROMPT</span><p>{build.originalPrompt}</p></div>
      {build.sources.length > 0 && <div className="input-media-list">{build.sources.map((source) => <article key={source.id}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Local object URLs cannot use the Next image optimizer. */}
        {source.kind === 'image' ? <img src={source.url} alt={`Input source ${source.name}`} /> : <video src={source.url} controls preload="metadata" />}
        <div><b>{source.name}</b><span>{source.kind === 'image' ? 'Image reference' : 'Video reference'}</span></div>
      </article>)}</div>}
      <div className="input-constraint-chips">{build.intent.requirements.map((requirement) => <span key={requirement.key}><b>{requirement.label}</b>{requirement.value}</span>)}</div>
      {build.additionalNotes && <div className="input-notes"><span>ADDITIONAL NOTES</span><p>{build.additionalNotes}</p></div>}
      <div className="demo-mode-note"><b>Local prototype inputs</b><span>Files remain browser-local. Their pixels, frames, and audio were not analyzed.</span></div>
    </div>
  );
}

function ProConstraintEditor({ state, selectedArtifact, onConstraint, onToggleFixed }: {
  state: EngineeringState;
  selectedArtifact: Artifact;
  onConstraint: (constraint: EngineeringConstraint) => void;
  onToggleFixed: (artifactId: string) => void;
}) {
  const valueFor = (key: string, fallback: number) => Number(state.constraints.find((constraint) => constraint.key === key)?.value ?? fallback);
  const fixed = state.fixedArtifactIds.includes(selectedArtifact.id);
  const fields = [
    { key: 'payload', label: 'Payload', unit: 'kg', fallback: 10.4 },
    { key: 'width', label: 'Max width', unit: 'mm', fallback: 400 },
    { key: 'voltage', label: 'Bus', unit: 'V', fallback: 24 },
    { key: 'peak-current', label: 'Peak current', unit: 'A', fallback: 30 },
    { key: 'budget', label: 'BOM ceiling', unit: 'USD', fallback: 700 },
  ];
  return (
    <details className="pro-constraints">
      <summary><SlidersHorizontal size={12} /> Explicit constraints <span>{state.constraints.length}</span></summary>
      <div className="constraint-grid">{fields.map((field) => <label key={field.key}><span>{field.label}</span><div><input type="number" defaultValue={valueFor(field.key, field.fallback)} onBlur={(event) => onConstraint({ key: field.key, label: field.label, value: Number(event.target.value), unit: field.unit, source: 'pro' })} /><small>{field.unit}</small></div></label>)}</div>
      <button className={fixed ? 'fixed' : ''} onClick={() => onToggleFixed(selectedArtifact.id)}><Lock size={11} /> {fixed ? `${selectedArtifact.label} is fixed` : `Keep ${selectedArtifact.label}`}</button>
    </details>
  );
}

function ValidationIcon({ status }: { status: ValidationStatus }) {
  if (status === 'pass') return <CheckCircle2 size={12} />;
  if (status === 'reject') return <CircleX size={12} />;
  return <AlertTriangle size={12} />;
}

function ProposalCard({ proposal, experience, onAccept, onShowGraph, onShowPro }: {
  proposal: EngineeringProposal;
  experience: ExperienceMode;
  onAccept: () => void;
  onShowGraph: () => void;
  onShowPro: () => void;
}) {
  const statusCopy = proposal.status === 'accepted' ? `${proposal.targetRevision} · APPLIED` : proposal.status === 'rejected' ? 'REJECTED · CONSTRAINT CONFLICT' : 'VALIDATED PROPOSAL';
  return (
    <div className={`recommendation proposal-card panel-enter ${proposal.status}`}>
      <div className="recommendation-label"><Zap size={13} /> {statusCopy}</div>
      <h4>{proposal.title}</h4>
      <div className="metric-row proposal-metrics">{proposal.metrics.slice(0, experience === 'pro' ? 5 : 3).map((metric) => <span className={metric.tone ?? ''} key={metric.label}><b>{metric.value}</b>{metric.label}</span>)}</div>
      <p>{proposal.summary}</p>
      {experience === 'pro' ? (
        <>
          <div className="mutation-list"><div className="eyebrow">REQUIRED CHANGES</div>{proposal.changed.map((change) => <div key={change.artifactId}><span>{change.artifactId}</span><p><b>{change.before}</b><ChevronRight size={10} /><b>{change.after}</b><small>{change.reason}</small></p></div>)}</div>
          <div className="validation-list"><div className="eyebrow">VALIDATION</div>{proposal.validation.map((check) => <div className={check.status} key={check.domain}><ValidationIcon status={check.status} /><span><b>{check.domain}</b><small>{check.message}</small></span></div>)}</div>
          <div className="preserved-line"><b>Unchanged</b><span>{proposal.preservedArtifactIds.map(artifactLabel).join(', ') || 'No other artifacts change.'}</span></div>
          <div className="opencad-handoff"><Wrench size={14} /><div><b>CAD handoff</b><span>{proposal.openCad.connected ? 'Connected' : 'Not connected; no CAD files were modified'} · {proposal.openCad.operations[0]}</span></div></div>
          <EvidenceList evidence={proposal.evidence} limit={3} />
        </>
      ) : <div className="guided-card-copy"><b>Why</b><span>{proposal.why}</span><b>Next</b><span>{proposal.nextAction}</span></div>}
      <div className="affected-line"><span>{proposal.affectedArtifactIds.length} affected · {proposal.changed.length} changed</span><div>{proposal.status === 'validated' && <button className="commit-button" onClick={onAccept}><Check size={11} /> Create {proposal.targetRevision}</button>}{experience === 'guided' && <button onClick={onShowPro}>Details</button>}<button onClick={onShowGraph}>Graph <ChevronRight size={12} /></button></div></div>
    </div>
  );
}

function ScannerPanel({ revision, observation, fixedArtifactIds, artifacts, generated, onClose, onObservation, onToggleFixed }: {
  revision: string;
  observation: ScannerMatch | null;
  fixedArtifactIds: string[];
  artifacts: Artifact[];
  generated: boolean;
  onClose: () => void;
  onObservation: (observation: ScannerMatch) => void;
  onToggleFixed: (artifactId: string) => void;
}) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [analysis, setAnalysis] = useState<ScannerAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const mediaKind = file?.type.startsWith('video/') ? 'video' : 'image';
  const generatedMatchOptions = artifacts.filter((artifact) => artifact.category !== 'overview').slice(0, 4).map((artifact) => [artifact.id, artifact.label] as const);
  const matchOptions: readonly (readonly [string, string])[] = generated ? generatedMatchOptions : [['j12', 'J12 Connector'], ['motor-bom', '24V Motor M2'], ['battery', 'Li-ion Battery'], ['main-board', 'Main Control Board']];
  const demoTarget = generated
    ? (artifacts.find((artifact) => artifact.id === 'scratch-camera') ?? artifacts.find((artifact) => artifact.category !== 'overview') ?? artifacts[0])
    : artifacts.find((artifact) => artifact.id === 'j12') ?? artifacts[0];

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const acquire = (nextFile: File | null) => {
    if (!nextFile) return;
    const isImage = nextFile.type.startsWith('image/');
    const isVideo = nextFile.type.startsWith('video/');
    if (!isImage && !isVideo) { setError('Choose a photo or video file.'); return; }
    const maxBytes = isVideo ? 120 * 1024 * 1024 : 15 * 1024 * 1024;
    if (nextFile.size > maxBytes) { setError(`Choose a ${isVideo ? 'video smaller than 120 MB' : 'photo smaller than 15 MB'}.`); return; }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(nextFile);
    setPreviewUrl(URL.createObjectURL(nextFile));
    setAnalysis(null);
    setError('');
  };

  const runSampleScan = async () => {
    setError('');
    setAnalyzing(true);
    try {
      const response = await fetch(`/api/scanner/demo/${generated ? 'rover' : 'j12'}`);
      if (!response.ok) throw new Error('Synthetic scanner asset is unavailable.');
      const demoFile = new File([await response.blob()], generated ? 'inspection-rover-reference.png' : 'j12-connector-closeup.png', { type: 'image/png' });
      acquire(demoFile);
      const result = generated && demoTarget
        ? { ...localScannerAdapter.confirmArtifact(demoTarget.id, demoTarget.label), explanation: 'Preset sample result for the prototype demo. The image pixels were not analyzed.' }
        : await localScannerAdapter.analyze(demoFile);
      setAnalysis(result);
      if (result.status === 'matched') onObservation(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the demo image.');
    } finally {
      setAnalyzing(false);
    }
  };

  const analyze = async () => {
    if (!file) { setError('Take a photo, upload a photo, or upload a video first.'); return; }
    setAnalyzing(true);
    setError('');
    try {
      let result: ScannerAnalysis;
      if (mediaKind === 'video' && demoTarget) {
        await sleep(650);
        result = {
          ...localScannerAdapter.confirmArtifact(demoTarget.id, demoTarget.label),
          explanation: 'Preset video result for the prototype demo. The video frames and audio were not analyzed.',
        };
      } else if (generated) {
        await sleep(650);
        result = {
          status: 'needs-confirmation',
          mode: 'no-inference',
          explanation: 'The photo was loaded locally. No vision model is connected, so select the artifact shown in the image.',
        };
      } else {
        result = await localScannerAdapter.analyze(file);
      }
      setAnalysis(result);
      if (result.status === 'matched') onObservation(result);
    } finally {
      setAnalyzing(false);
    }
  };

  const confirm = (artifactId: string, label: string) => {
    const result = localScannerAdapter.confirmArtifact(artifactId, label);
    setAnalysis(result);
    onObservation(result);
  };

  const activeMatch = analysis?.status === 'matched' ? analysis : (!previewUrl ? observation : null);
  const isFixed = activeMatch ? fixedArtifactIds.includes(activeMatch.artifactId) : false;

  return (
    <section className="mode-panel scanner-panel panel-enter" key="scanner">
      <div className="mode-panel-head"><div><span className="mode-icon"><Camera size={15} /></span><div><div className="eyebrow">PHOTO · VIDEO · CAMERA</div><h3>Scanner</h3></div></div><button onClick={onClose}><X size={15} /></button></div>
      <p>Take a photo, upload a photo, or upload a video, then link the demo result to the project graph.</p>
      <input ref={cameraInput} hidden type="file" accept="image/*" capture="environment" onChange={(event) => acquire(event.target.files?.[0] ?? null)} />
      <input ref={photoInput} hidden type="file" accept="image/*" onChange={(event) => acquire(event.target.files?.[0] ?? null)} />
      <input ref={videoInput} hidden type="file" accept="video/*" onChange={(event) => acquire(event.target.files?.[0] ?? null)} />
      <div className={`scanner-view ${activeMatch ? 'matched' : ''} ${previewUrl ? 'has-media' : ''}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Local object URLs cannot use the Next image optimizer. */}
        {previewUrl ? (mediaKind === 'video' ? <video src={previewUrl} controls playsInline preload="metadata" /> : <img src={previewUrl} alt="Locally acquired scanner input" />) : <div className="rover-silhouette"><div className="rover-body" /><div className="rover-camera" /><i className="wheel one" /><i className="wheel two" /><i className="connector-target" /></div>}
        {(analyzing || (previewUrl && !analysis)) && <div className="scan-line" />}
        {activeMatch && <div className="detected-bounds" style={{ left: `${activeMatch.bounds.x}%`, top: `${activeMatch.bounds.y}%`, width: `${activeMatch.bounds.width}%`, height: `${activeMatch.bounds.height}%` }}><span>{activeMatch.label}</span></div>}
        <div className="scan-readout"><span>{file ? file.name : 'NO MEDIA ACQUIRED'}</span><span>{activeMatch?.mode === 'manual-observation' ? 'DEMO / USER LINK' : activeMatch ? 'DEMO LABEL MATCH' : mediaKind === 'video' ? 'LOCAL VIDEO' : 'LOCAL PHOTO'}</span></div>
      </div>
      <div className="scanner-input-actions"><button onClick={() => cameraInput.current?.click()}><Camera size={13} /> Take Photo</button><button onClick={() => photoInput.current?.click()}><Upload size={13} /> Upload Photo</button><button onClick={() => videoInput.current?.click()}><Film size={13} /> Upload Video</button></div>
      <button className="demo-asset-button" disabled={analyzing} onClick={() => void runSampleScan()}><Play size={13} /> {analyzing ? 'Running sample scan…' : 'Run sample scan'}</button>
      <div className="demo-mode-note"><b>Demo simulation</b><span>Media acquisition and previews are real. Photo labels and video results are presets; no vision, frame, or audio AI is connected.</span></div>
      {file && !analysis && <button className="scan-button" disabled={analyzing} onClick={() => void analyze()}><ScanLine size={15} /> {analyzing ? 'Running prototype sequence…' : `Run ${mediaKind === 'video' ? 'demo video scan' : 'demo photo matcher'}`}</button>}
      {analysis?.status === 'needs-confirmation' && <div className="manual-match"><div className="scanner-disclosure"><AlertTriangle size={13} /><span>{analysis.explanation}</span></div><div>{matchOptions.map(([id, label]) => <button key={id} onClick={() => confirm(id, label)}>{label}<ChevronRight size={11} /></button>)}</div></div>}
      {activeMatch && <div className="scanner-status"><span className="scanner-status-icon"><Check size={15} /></span><div><strong>{activeMatch.label} linked</strong><small>Product graph · {revision} · {activeMatch.confidence ? `${Math.round(activeMatch.confidence * 100)}% demo match` : 'confirmed manually'}</small></div></div>}
      {activeMatch && <><div className="scanner-disclosure"><Info size={13} /><span>{activeMatch.explanation}</span></div><button className={`fixed-part-button ${isFixed ? 'fixed' : ''}`} onClick={() => onToggleFixed(activeMatch.artifactId)}><Lock size={13} /> {isFixed ? 'Fixed constraint added' : 'Use as a fixed constraint'}</button></>}
      {!localScannerAdapter.inferenceConnected && <div className="runtime-note"><Cable size={15} /><div><b>Media inference adapter not connected</b><span>Camera, photo upload, and video upload are real; automatic detection is explicitly simulated.</span></div></div>}
      {error && <div className="backend-error">{error}</div>}
    </section>
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
  const [demoAnswer, setDemoAnswer] = useState(false);

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
    setDemoAnswer(false);
    setError('');
    onArtifacts([]);
  };

  const submit = async (questionOverride?: string, demo = false) => {
    const submittedQuestion = (questionOverride ?? question).trim();
    if (!submittedQuestion || loading) return;
    setQuestion(submittedQuestion);
    setLoading(true);
    setError('');
    setDemoAnswer(demo);
    try {
      const result = await askAgent(activeAgent, submittedQuestion);
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
      <div className="mode-panel-head"><div><span className="mode-icon"><Bot size={16} /></span><div><div className="eyebrow">LOCAL DATASET</div><h3>Engineering Agents</h3></div></div><button onClick={onClose}><X size={15} /></button></div>
      <p>Each agent uses the committed rover dataset and returns the files and graph artifacts behind its answer.</p>
      <div className={`backend-state ${health ? 'online' : ''}`}><span /><div><b>{health ? 'Dataset ready' : 'Loading dataset...'}</b><small>{health ? `${health.indexedDocuments} indexed documents · ${health.artifacts} artifacts · ${health.scenarios} scenarios` : 'Building the local search index'}</small></div></div>
      <div className="agent-list">
        {agents.map(({ kind, name, copy, Icon }) => (
          <button className={`agent-card ${activeAgent === kind ? 'active' : ''}`} key={kind} onClick={() => selectAgent(kind)}>
            <span className="agent-icon"><Icon size={16} /></span>
            <span><strong>{name}</strong><small>{copy}</small></span>
            <ChevronRight size={14} />
          </button>
        ))}
      </div>
      <button className="agent-demo-button" disabled={loading} onClick={() => void submit(AGENT_PROMPTS[activeAgent], true)}><Play size={13} /> {loading && demoAnswer ? 'Running sample…' : `Run sample ${activeAgent} answer`}</button>
      <div className="demo-mode-note"><b>Demo simulation</b><span>Answers come from bundled example scenarios and local project files, not a general AI chat service.</span></div>
      <label className="agent-query"><span>ASK {activeAgent.toUpperCase()}</span><textarea value={question} onChange={(event) => { setQuestion(event.target.value); setDemoAnswer(false); }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); } }} /><button disabled={loading} onClick={() => void submit()}><Send size={13} /> {loading && !demoAnswer ? 'Reading project files...' : 'Search project data'}</button></label>
      {error && <div className="backend-error">{error}</div>}
      {answer && (
        <div className="agent-response panel-enter">
          <div className="agent-response-head"><span>{demoAnswer ? 'SAMPLE ANSWER' : answer.mode === 'ground-truth' ? 'MATCHED DATASET ANSWER' : 'SEARCH RESULT'}</span><b>{Math.round(answer.confidence * 100)}% · {answer.latencyMs}ms</b></div>
          <p>{answer.answer}</p>
          <div className="agent-artifacts">{answer.artifactIds.slice(0, 8).map((id) => <span key={id}>{id}</span>)}</div>
          <EvidenceList evidence={answer.evidence} limit={3} />
        </div>
      )}
      <div className="runtime-note"><Cable size={15} /><div><b>Runs locally</b><span>No database or cloud model is required.</span></div></div>
    </div>
  );
}
