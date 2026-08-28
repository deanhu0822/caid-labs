'use client';
/* eslint-disable @next/next/no-img-element -- Browser-local object URLs cannot use the Next image optimizer. */

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
  type ReactFlowInstance,
  type Viewport,
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
  FileText,
  Film,
  FlaskConical,
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
  cameraMountGeometryProposal,
  proposalFromAgent,
  type EngineeringConstraint,
  type EngineeringDocumentRecord,
  type EngineeringProposal,
  type EngineeringState,
  type ExperienceMode,
  type ValidationStatus,
} from '@/lib/engineering-state';
import { analyzeWithConfiguredInference, localScannerAdapter, type ScannerAnalysis, type ScannerMatch } from '@/lib/scanner-analysis';
import { DEMO_CODE_PREVIEWS, type DemoCodePreview } from './demo-code';
import { DemoWalkthrough, type DemoRuntime } from './demo-walkthrough';
import { OpenCadWorkspace } from './opencad-workspace';
import { StartFromScratch } from './start-from-scratch';
import { TestAssetHarness } from './test-asset-harness';
import type { PrototypeBuildDefinition } from '@/lib/new-build-adapter';
import { DEMO_FEATURES, DEMO_IMPACT_IDS, DEMO_OBJECTIVE, DEMO_STAGES, demoAgentResponse } from '@/lib/demo-walkthrough';
import type { OpenCadRealizationRecord } from '@/lib/opencad-adapter';
import { mapProductToGraph, type ProductCandidateId } from '@/lib/product-state';
import type { FormaInferenceStatus } from '@/lib/forma-inference';
import type { DemoWorkflowReceipt } from '@/lib/demo-workflow';

type ArtifactData = Artifact & { activeRevision: string };
type ArtifactNode = Node<ArtifactData, 'artifact'>;
type AppMode = 'graph' | 'builder' | 'scanner' | 'agents';
type EdgeLabelMode = 'auto' | 'always' | 'off';

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

function graphAnimationDuration() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320;
}

async function askAgent(agent: AgentKind, question: string, productCandidateId?: ProductCandidateId, demo = false): Promise<AgentResponse> {
  const response = await fetch('/api/agents/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent, question, productCandidateId, demo }),
  });
  const payload = await response.json() as AgentResponse & { error?: string };
  if (!response.ok) throw new Error(payload.error || 'The corpus agent could not answer that question.');
  return payload;
}

async function requestDemoWorkflow(input: { objective: string; approved?: boolean; runId?: string; createdAt?: string }): Promise<DemoWorkflowReceipt> {
  const response = await fetch('/api/workflow/demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await response.json() as DemoWorkflowReceipt & { error?: string };
  if (!response.ok) throw new Error(payload.error || 'The workflow receipt could not be created.');
  return payload;
}

export default function Home() {
  const [engineering, dispatch] = useReducer(engineeringReducer, initialEngineeringState);
  const existingGraph = useMemo(() => engineering.productState
    ? mapProductToGraph(engineering.productState, ARTIFACTS, RELATIONS)
    : { artifacts: ARTIFACTS, relations: RELATIONS }, [engineering.productState]);
  const activeArtifacts: Artifact[] = useMemo(() => engineering.project.kind === 'generated'
    ? engineering.project.build.architecture.artifacts
    : existingGraph.artifacts, [engineering.project, existingGraph.artifacts]);
  const activeRelations: Relation[] = useMemo(() => engineering.project.kind === 'generated'
    ? engineering.project.build.architecture.relations
    : existingGraph.relations, [engineering.project, existingGraph.relations]);
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
  const [openedArtifactId, setOpenedArtifactId] = useState<string | null>(null);
  const [demoRuntime, setDemoRuntime] = useState<DemoRuntime>({ active: false, paused: false, step: 0, runId: 0 });
  const [demoReceipt, setDemoReceipt] = useState<DemoWorkflowReceipt | null>(null);
  const [demoReceiptLoading, setDemoReceiptLoading] = useState(false);
  const [demoReceiptError, setDemoReceiptError] = useState('');
  const [scratchOpen, setScratchOpen] = useState(false);
  const [testAssetsOpen, setTestAssetsOpen] = useState(false);
  const [demoMenuOpen, setDemoMenuOpen] = useState(false);
  const [openCadOpen, setOpenCadOpen] = useState(false);
  const [openCadAutoRebuild, setOpenCadAutoRebuild] = useState(false);
  const [edgeLabelMode, setEdgeLabelMode] = useState<EdgeLabelMode>('auto');
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const graphStageRef = useRef<HTMLElement>(null);
  const reactFlowRef = useRef<ReactFlowInstance<ArtifactNode> | null>(null);
  const savedViewportRef = useRef<Viewport | null>(null);
  const engineeringRef = useRef(engineering);
  const demoReceiptRequestRef = useRef(0);
  const demoRunning = demoRuntime.active;

  useEffect(() => {
    engineeringRef.current = engineering;
  }, [engineering]);

  const selectedId = engineering.selectedArtifactId;
  const revision = engineering.viewingRevision;
  const proposal = engineering.proposal;
  const physicalRealization = engineering.physicalRealizations[engineering.physicalRealizations.length - 1] ?? null;
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
    if (!selectedId) return new Set<string>();
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
          highlighted.size === 0 ? '' : isHighlighted ? 'is-highlighted' : 'is-dimmed',
          isChanged ? 'is-changed' : '',
        ].join(' '),
      };
    }), [activeCategories, allNodes, highlighted, revision, revisionRecord, selectedId]);

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleEdges = useMemo(() => activeRelations
    .filter((edge) => activeEdges.has(edge.kind) && visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
    .map((edge) => {
      const active = highlighted.size === 0 || highlighted.has(edge.source) && highlighted.has(edge.target);
      const direct = focusedNodeId === selectedId && (edge.source === selectedId || edge.target === selectedId);
      const showLabel = edgeLabelMode === 'always' || edgeLabelMode === 'auto' && (direct || hoveredEdgeId === edge.id);
      const color = active ? EDGE_META[edge.kind].color : '#3c465d';
      return {
        ...edge,
        animated: true,
        className: active ? 'relation-active' : 'relation-dimmed',
        style: { stroke: color, strokeWidth: active ? 2 : 1.15 },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 12, height: 12 },
        label: showLabel ? EDGE_META[edge.kind].label : undefined,
        ariaLabel: `${EDGE_META[edge.kind].label}: ${edge.description ?? `${edge.source} to ${edge.target}`}`,
        labelStyle: { fill: '#d8e1ef', fontSize: 7, fontFamily: 'var(--font-geist-mono)' },
        labelBgStyle: { fill: '#0b111b', fillOpacity: .96, stroke: color, strokeWidth: .6 },
        labelBgPadding: [5, 3] as [number, number],
        labelBgBorderRadius: 5,
        interactionWidth: 22,
      };
    }), [activeEdges, activeRelations, edgeLabelMode, focusedNodeId, highlighted, hoveredEdgeId, selectedId, visibleNodeIds]);

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

  const restoreGraphViewport = useCallback(() => {
    const instance = reactFlowRef.current;
    const viewport = savedViewportRef.current;
    setFocusedNodeId(null);
    savedViewportRef.current = null;
    setOpenedArtifactId(null);
    dispatch({ type: 'CLEAR_SELECTION' });
    if (instance && viewport) void instance.setViewport(viewport, { duration: graphAnimationDuration() });
  }, []);

  const chooseNode = useCallback((id: string) => {
    const artifact = activeArtifacts.find((item) => item.id === id);
    if (!artifact) return;
    if (focusedNodeId === id) {
      restoreGraphViewport();
      return;
    }

    const instance = reactFlowRef.current;
    if (instance && !savedViewportRef.current) savedViewportRef.current = instance.getViewport();
    setFocusedNodeId(id);
    setOpenedArtifactId(null);
    dispatch({ type: 'SET_FOCUS', artifactIds: [] });
    dispatch({ type: 'SELECT_ARTIFACT', artifactId: id });
    if (!activeCategories.has(artifact.category)) setActiveCategories((current) => new Set([...current, artifact.category]));

    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const flow = reactFlowRef.current;
      const node = flow?.getNode(id);
      const stage = graphStageRef.current;
      if (!flow || !node || !stage) return;
      const current = flow.getViewport();
      const rect = stage.getBoundingClientRect();
      const neighborIds = activeRelations.flatMap((relation) => relation.source === id ? [relation.target] : relation.target === id ? [relation.source] : []);
      const nodesToFit = [id, ...neighborIds]
        .map((nodeId) => flow.getNode(nodeId))
        .filter((candidate): candidate is ArtifactNode => Boolean(candidate));
      const comfortablyVisible = nodesToFit.every((candidate) => {
        const width = candidate.measured?.width ?? candidate.width ?? 158;
        const height = candidate.measured?.height ?? candidate.height ?? 58;
        const screen = flow.flowToScreenPosition({ x: candidate.position.x + width / 2, y: candidate.position.y + height / 2 });
        return screen.x > rect.left + rect.width * .12
          && screen.x < rect.right - rect.width * .12
          && screen.y > rect.top + rect.height * .14
          && screen.y < rect.bottom - rect.height * .14;
      });
      if (current.zoom >= .92 && comfortablyVisible) return;
      void flow.fitView({ nodes: nodesToFit, padding: .28, minZoom: .62, maxZoom: 1.05, duration: graphAnimationDuration() });
    }));
  }, [activeArtifacts, activeCategories, activeRelations, focusedNodeId, restoreGraphViewport]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || scratchOpen || testAssetsOpen || openCadOpen || impactOpen || howOpen || demoMenuOpen) return;
      if (openedArtifactId) {
        setOpenedArtifactId(null);
        return;
      }
      if (focusedNodeId) restoreGraphViewport();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [demoMenuOpen, focusedNodeId, howOpen, impactOpen, openCadOpen, openedArtifactId, restoreGraphViewport, scratchOpen, testAssetsOpen]);

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
      const result = await askAgent('builder', objective, engineering.productState?.candidateId);
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
      dispatch({ type: 'SET_EXPERIENCE', mode: 'pro' });
      setMode('builder');
    } else if (stage.phase === 'guided') {
      dispatch({ type: 'SET_EXPERIENCE', mode: 'guided' });
      setMode('builder');
    } else if (stage.phase === 'pro') {
      dispatch({ type: 'SET_EXPERIENCE', mode: 'pro' });
      setMode('builder');
    }
  }, []);

  const startDemo = () => {
    const receiptRequest = demoReceiptRequestRef.current + 1;
    demoReceiptRequestRef.current = receiptRequest;
    setFocusedNodeId(null);
    savedViewportRef.current = null;
    setOpenedArtifactId(null);
    setBuilderError('');
    setImpactOpen(false);
    setHowOpen(false);
    setScratchOpen(false);
    setTestAssetsOpen(false);
    setDemoMenuOpen(false);
    setDemoReceipt(null);
    setDemoReceiptError('');
    setDemoReceiptLoading(true);
    applyDemoStage(0);
    setDemoRuntime((current) => ({ active: true, paused: false, step: 0, runId: current.runId + 1 }));
    void requestDemoWorkflow({ objective: DEMO_OBJECTIVE })
      .then((receipt) => {
        if (demoReceiptRequestRef.current !== receiptRequest) return;
        setDemoReceipt(receipt);
      })
      .catch((error) => {
        if (demoReceiptRequestRef.current !== receiptRequest) return;
        setDemoReceiptError(error instanceof Error ? error.message : 'The workflow receipt could not be created.');
      })
      .finally(() => {
        if (demoReceiptRequestRef.current === receiptRequest) setDemoReceiptLoading(false);
      });
  };

  const approveDemoRevision = () => {
    if (!demoReceipt?.approval.commitEligible || demoReceiptLoading) return;
    const receiptRequest = demoReceiptRequestRef.current + 1;
    demoReceiptRequestRef.current = receiptRequest;
    setDemoReceiptError('');
    setDemoReceiptLoading(true);
    void requestDemoWorkflow({
      objective: demoReceipt.objective,
      approved: true,
      runId: demoReceipt.runId,
      createdAt: demoReceipt.createdAt,
    }).then((receipt) => {
      if (demoReceiptRequestRef.current !== receiptRequest) return;
      if (!receipt.approval.approved || receipt.state !== 'committed') throw new Error(receipt.approval.message);
      dispatch({ type: 'ACCEPT_PROPOSAL' });
      setDemoReceipt(receipt);
      applyDemoStage(6);
      setDemoRuntime((current) => ({ ...current, paused: false, step: 6 }));
    }).catch((error) => {
      if (demoReceiptRequestRef.current !== receiptRequest) return;
      setDemoReceiptError(error instanceof Error ? error.message : 'Revision approval failed.');
    }).finally(() => {
      if (demoReceiptRequestRef.current === receiptRequest) setDemoReceiptLoading(false);
    });
  };

  const startGeometryDemo = () => {
    const nextProposal = cameraMountGeometryProposal({ ...initialEngineeringState, experienceMode: 'guided' }, 105);
    dispatch({ type: 'RESET_TO_EXISTING' });
    dispatch({ type: 'SET_EXPERIENCE', mode: 'guided' });
    dispatch({ type: 'SET_PROPOSAL', proposal: nextProposal });
    dispatch({ type: 'SELECT_ARTIFACT', artifactId: 'camera-mount' });
    setBuilderQuery(nextProposal.objective);
    setMode('builder');
    setOpenedArtifactId(null);
    setDemoMenuOpen(false);
    setOpenCadAutoRebuild(true);
    setOpenCadOpen(true);
  };

  const openPhysicalDesign = (autoRebuild = false) => {
    setOpenCadAutoRebuild(autoRebuild);
    setOpenCadOpen(true);
  };

  const applyPhysicalDesign = (result: OpenCadRealizationRecord) => {
    dispatch({ type: 'APPLY_GEOMETRY_RESULT', result });
    setOpenCadOpen(false);
    setOpenCadAutoRebuild(false);
    setMode('builder');
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

  const baseDetails = DETAIL_OVERRIDES[selectedArtifact.id] ?? {
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
  const selectedOpenLabel = DEMO_CODE_PREVIEWS[selectedArtifact.id]
    ? 'Open Full Code'
    : selectedArtifact.category === 'documents'
      ? 'Open Document'
      : selectedArtifact.category === 'bom'
        ? 'Open Full BOM'
        : selectedArtifact.category === 'mechanical'
          ? 'Open in CAD'
          : null;
  const openedArtifact = openedArtifactId ? activeArtifacts.find((artifact) => artifact.id === openedArtifactId) ?? null : null;
  const openedDocument = openedArtifactId ? engineering.documents.find((document) => document.artifactId === openedArtifactId) ?? null : null;
  const selectedDocument = engineering.documents.find((document) => document.artifactId === selectedArtifact.id) ?? null;
  const selectedRelationships = activeRelations.filter((relation) => relation.source === selectedArtifact.id || relation.target === selectedArtifact.id);

  const openSelectedArtifact = () => {
    if (!selectedOpenLabel) return;
    if (selectedArtifact.id === 'camera-mount' && proposal?.openCad.required) {
      openPhysicalDesign(false);
      return;
    }
    setOpenedArtifactId(selectedArtifact.id);
  };

  const analyzeJ12Change = () => {
    setOpenedArtifactId(null);
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
    setFocusedNodeId(null);
    savedViewportRef.current = null;
    dispatch({ type: 'CREATE_NEW_BUILD', build });
    setMode('graph');
    setOpenedArtifactId(null);
    setImpactOpen(false);
    setBuilderError('');
    setScratchOpen(false);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => void reactFlowRef.current?.fitView({ padding: .13, minZoom: .42, maxZoom: .8, duration: graphAnimationDuration() })));
  };

  const openExistingBuild = () => {
    setFocusedNodeId(null);
    savedViewportRef.current = null;
    dispatch({ type: 'RESET_TO_EXISTING' });
    setMode('graph');
    setOpenedArtifactId(null);
    setImpactOpen(false);
    setBuilderError('');
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => void reactFlowRef.current?.fitView({ padding: .13, minZoom: .42, maxZoom: .8, duration: graphAnimationDuration() })));
  };

  return (
    <main className={`app-shell ${engineering.experienceMode}-experience ${engineering.experienceMode === 'pro' && mode === 'graph' && focusedNodeId ? 'artifact-preview-open' : ''}`}>
      <header className="topbar">
        <div className="brand-mark"><GitBranch size={16} /></div>
        <div className="brand">FORMA LABS <span>/</span> {engineering.project.id} <span>/</span> {revision.toLowerCase().replace(' ', '-')}</div>
        <div className="experience-switch" aria-label="Experience mode">
          <button aria-label="Beginner mode" className={engineering.experienceMode === 'guided' ? 'active' : ''} onClick={() => switchExperience('guided')}><Sparkles size={12} /><span><b>Beginner</b><small>Step-by-step workflow</small></span></button>
          <button aria-label="Pro mode" className={engineering.experienceMode === 'pro' ? 'active' : ''} onClick={() => switchExperience('pro')}><SlidersHorizontal size={12} /><span><b>Pro</b><small>Engineering workspace</small></span></button>
        </div>
        <nav aria-label="Workspace modes">
          {(['graph', 'builder', 'scanner'] as AppMode[]).map((item) => (
            <button key={item} className={mode === item ? 'active' : ''} onClick={() => { setMode(item); setOpenedArtifactId(null); }}>
              {item === 'graph' ? <Layers3 size={14} /> : item === 'builder' ? <Sparkles size={14} /> : <ScanLine size={14} />}
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
          <button className={mode === 'agents' ? 'active' : ''} onClick={() => { setMode('agents'); setOpenedArtifactId(null); }}><Bot size={14} /> Agents</button>
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
          <button className="test-assets-button" onClick={() => setTestAssetsOpen(true)}><FlaskConical size={14} /> <span>Test Assets</span></button>
          <button className="how-button" onClick={() => setHowOpen(true)}><Info size={14} /> <span>How it works</span></button>
          <button className="demo-top" onClick={() => setDemoMenuOpen(true)} disabled={demoRunning || engineering.project.kind === 'generated'}><Play size={14} /> {demoRunning ? 'Running…' : 'Run Demo'}</button>
          <button className="accent" onClick={() => { setMode('builder'); setBuilderError(''); }}><Sparkles size={15} /> Builder</button>
        </div>
      </header>

      <aside className="sidebar">
        {engineering.experienceMode === 'guided' ? (
          <GuidedRail state={engineering} onConstraint={setConstraint} />
        ) : (
          <>
        <div className="side-heading"><div className="eyebrow">PRODUCT GRAPH</div><span>{activeArtifacts.length} artifacts</span></div>
        <ProductValidationSummary state={engineering} />
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

      <section className="graph-stage" ref={graphStageRef}>
        <div className="graph-meta">
          <span>{engineering.project.name}</span>
          <small>{revision.toUpperCase()} · {revision === engineering.currentRevision ? 'CURRENT REVISION' : 'HISTORICAL REVISION'} · {activeArtifacts.length} ARTIFACTS · {activeRelations.length} RELATIONSHIPS</small>
        </div>
        <div className="blast-legend"><span className="pulse-dot" /> {highlighted.size ? `${highlighted.size} related artifacts highlighted` : 'Overview restored'}</div>
        <div className="edge-label-toggle" aria-label="Edge label visibility"><span>EDGE LABELS</span>{(['auto', 'always', 'off'] as EdgeLabelMode[]).map((labelMode) => <button key={labelMode} className={edgeLabelMode === labelMode ? 'active' : ''} onClick={() => setEdgeLabelMode(labelMode)}>{labelMode}</button>)}</div>
        <ReactFlow
          nodes={visibleNodes}
          edges={visibleEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onInit={(instance) => { reactFlowRef.current = instance as unknown as ReactFlowInstance<ArtifactNode>; }}
          onNodeClick={(_, node) => chooseNode(node.id)}
          onEdgeMouseEnter={(_, edge) => setHoveredEdgeId(edge.id)}
          onEdgeMouseLeave={() => setHoveredEdgeId(null)}
          onPaneClick={() => { if (!impactOpen && mode === 'graph') restoreGraphViewport(); }}
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

        <div className="graph-hint"><Focus size={13} /> Click to focus · click again, background, or Escape to restore · use Open in the inspector</div>

        <>
          {mode === 'graph' && openedArtifact && DEMO_CODE_PREVIEWS[openedArtifact.id] && (
            <DemoCodePanel
              artifactLabel={openedArtifact.label}
              preview={DEMO_CODE_PREVIEWS[openedArtifact.id]}
              onClose={() => setOpenedArtifactId(null)}
            />
          )}
          {mode === 'graph' && openedArtifact && !DEMO_CODE_PREVIEWS[openedArtifact.id] && (
            <ArtifactAssetPanel artifact={openedArtifact} document={openedDocument} onClose={() => setOpenedArtifactId(null)} />
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
              {proposal && <ProposalCard proposal={proposal} realization={physicalRealization} experience={engineering.experienceMode} onAccept={() => dispatch({ type: 'ACCEPT_PROPOSAL' })} onOpenCad={() => openPhysicalDesign(false)} onShowGraph={() => setMode('graph')} onShowPro={() => switchExperience('pro')} />}
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

      <aside className={`details ${mode === 'agents' ? 'agents-open' : ''} ${engineering.experienceMode === 'guided' && mode !== 'scanner' ? 'guided-open' : ''} ${engineering.experienceMode === 'pro' && mode === 'graph' && focusedNodeId ? 'artifact-inspector-open' : ''}`}>
        {engineering.experienceMode === 'guided' ? (
          <GuidedPanel
            state={engineering}
            query={builderQuery}
            loading={builderLoading}
            error={builderError}
            onQuery={setBuilderQuery}
            onRun={(query) => { setMode('builder'); void runBuilder(query); }}
            onAccept={() => dispatch({ type: 'ACCEPT_PROPOSAL' })}
            onOpenCad={() => openPhysicalDesign(false)}
            onShowPro={() => switchExperience('pro')}
            onOpenScanner={() => setMode('scanner')}
            onAnalyzeJ12={analyzeJ12Change}
            onConstraint={setConstraint}
          />
        ) : mode === 'agents' ? (
          <AgentPanel
            productCandidateId={engineering.productState?.candidateId}
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
            <div className="detail-title-row"><div><h2>{selectedArtifact.label}</h2><p>{selectedArtifact.meta} · {selectedMutation ? `${revision} current` : selectedArtifact.revision ? revision : 'released'}</p></div><button aria-label="Focus selected artifact" onClick={() => { if (focusedNodeId !== selectedArtifact.id) chooseNode(selectedArtifact.id); }}><Maximize2 size={15} /></button><button className="artifact-inspector-close" aria-label="Close artifact inspector" onClick={restoreGraphViewport}><X size={15} /></button></div>
            <ArtifactPreviewContent artifact={selectedArtifact} revision={revision} document={selectedDocument} details={details} />
            <div className="details-section">
              <div className="eyebrow">PROPERTIES</div>
              <dl>{Object.entries(details).map(([label, value]) => <div key={label}><dt>{label}</dt><dd className={String(value).includes('LOW') ? 'warning' : ''}>{value}</dd></div>)}</dl>
            </div>
            {selectedOpenLabel && <button className="artifact-open-button" onClick={openSelectedArtifact}>{DEMO_CODE_PREVIEWS[selectedArtifact.id] ? <Code2 size={17} /> : selectedArtifact.category === 'documents' ? <FileText size={17} /> : <Box size={17} />}<span><b>{selectedOpenLabel}</b><small>{selectedArtifact.category === 'documents' ? 'View the complete document record' : selectedArtifact.category === 'bom' ? 'Inspect the complete purchasing record' : selectedArtifact.category === 'mechanical' ? 'Inspect the physical design record' : 'Inspect the complete hypothetical demo source'}</small></span><ChevronRight size={16} /></button>}
            {engineering.project.kind === 'existing'
              ? <button className="analyze-button" onClick={analyzeJ12Change}><Sparkles size={15} /><span><b>Analyze Change</b><small>Replace connector with available alternate</small></span><ChevronRight size={14} /></button>
              : <button className="analyze-button" onClick={() => switchExperience('guided')}><Sparkles size={15} /><span><b>Choose next decision</b><small>{engineering.project.build.architecture.nextDecision.title}</small></span><ChevronRight size={14} /></button>}
            {engineering.project.kind === 'generated' && <InputSourcesPanel build={engineering.project.build} />}
            <RelationshipDetails artifact={selectedArtifact} relations={selectedRelationships} artifacts={activeArtifacts} />
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
        <div className="timeline-view"><button className="play-button" onClick={() => setDemoMenuOpen(true)} disabled={demoRunning || engineering.project.kind === 'generated'} aria-label="Run demo"><Play size={16} /></button><div><div className="eyebrow">VIEWING {revision === engineering.currentRevision ? 'CURRENT' : 'HISTORY'}</div><strong>{revision} · {revisionRecord?.date ?? 'Now'}</strong></div></div>
        <div className="timeline-track" aria-label="Product revisions">
          {engineering.revisions.map((item) => <button key={item.id} className={revision === item.id ? 'current' : ''} onClick={() => dispatch({ type: 'SET_VIEWING_REVISION', revision: item.id })}><i /><span>{item.id}<small>{item.date}</small></span></button>)}
        </div>
        <div className="timeline-actions"><span>{revisionChanges.length} changed · {engineering.currentRevision} current</span><button onClick={() => setDemoMenuOpen(true)} disabled={demoRunning || engineering.project.kind === 'generated'}><Play size={12} /> {demoRunning ? 'Demo running' : 'Run Demo'}</button></div>
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
            <div className="opencad-principle"><Wrench size={15} /><p><b>OpenCAD runs locally when geometry is required.</b><span>Forma decides what must change; OpenCAD rebuilds and validates the physical result. If the local OCCT service is absent, Forma reports it instead of claiming a CAD operation.</span></p></div>
          </section>
        </div>
      )}

      {scratchOpen && <StartFromScratch onClose={() => setScratchOpen(false)} onCreate={createNewBuild} />}
      {testAssetsOpen && <TestAssetHarness onClose={() => setTestAssetsOpen(false)} />}
      {demoMenuOpen && (
        <div className="modal-backdrop overlay-enter" onMouseDown={(event) => { if (event.target === event.currentTarget) setDemoMenuOpen(false); }}>
          <section className="demo-picker modal-enter">
            <header><div><div className="eyebrow">CHOOSE A WALKTHROUGH</div><h2>Run a Forma demo</h2></div><button onClick={() => setDemoMenuOpen(false)}><X size={16} /></button></header>
            <p>Both paths update the same product graph and revision state. OpenCAD appears only when physical geometry must change.</p>
            <div>
              <button onClick={startDemo}><span><Activity size={17} /></span><div><small>ENGINEERING CHANGE</small><b>Increase payload by 30%</b><p>Motor, controller, firmware, BOM, validation, and Rev D. No geometry change required.</p></div><ChevronRight size={15} /></button>
              <button onClick={startGeometryDemo}><span><Box size={17} /></span><div><small>PHYSICAL REALIZATION</small><b>Raise the camera mount 25 mm</b><p>Forma isolates the change, then opens the focused OpenCAD workspace for rebuild and validation.</p></div><ChevronRight size={15} /></button>
            </div>
          </section>
        </div>
      )}
      {openCadOpen && proposal?.openCad.required && (
        <OpenCadWorkspace
          experience={engineering.experienceMode}
          fromRevision={proposal.baseRevision}
          toRevision={proposal.targetRevision}
          initialHeightMm={Number(proposal.changed.find((change) => change.artifactId === 'camera-mount')?.after.match(/\d+/)?.[0] ?? 105)}
          autoRebuild={openCadAutoRebuild}
          onApply={applyPhysicalDesign}
          onClose={() => { setOpenCadOpen(false); setOpenCadAutoRebuild(false); }}
        />
      )}
      <DemoWalkthrough
        runtime={demoRuntime}
        revision={engineering.currentRevision}
        receipt={demoReceipt}
        receiptLoading={demoReceiptLoading}
        receiptError={demoReceiptError}
        onPause={() => setDemoRuntime((current) => ({ ...current, paused: !current.paused }))}
        onRestart={startDemo}
        onSkip={skipDemoStage}
        onApprove={approveDemoRevision}
        onExit={() => setDemoRuntime((current) => ({ ...current, active: false, paused: false }))}
      />
    </main>
  );
}

function artifactLabel(id: string) {
  return ARTIFACTS.find((artifact) => artifact.id === id)?.label ?? id;
}

function RelationshipDetails({ artifact, relations, artifacts }: { artifact: Artifact; relations: Relation[]; artifacts: Artifact[] }) {
  if (!relations.length) return null;
  return (
    <section className="details-section relationship-details">
      <div className="eyebrow">RELATIONSHIPS · {relations.length}</div>
      <div className="relationship-detail-list">
        {relations.slice(0, 8).map((relation) => {
          const outgoing = relation.source === artifact.id;
          const otherId = outgoing ? relation.target : relation.source;
          const other = artifacts.find((item) => item.id === otherId);
          return (
            <article key={relation.id}>
              <header><b>{other?.label ?? otherId}</b><span style={{ color: EDGE_META[relation.kind].color }}>{outgoing ? `${EDGE_META[relation.kind].label} →` : `← ${EDGE_META[relation.kind].label}`}</span></header>
              <p>{relation.description ?? `${artifact.label} has a ${EDGE_META[relation.kind].label.toLowerCase()} relationship with ${other?.label ?? otherId}.`}</p>
              {relation.productRelationship && <small>Product relationship: {relation.productRelationship}</small>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ArtifactPreviewContent({ artifact, revision, document, details }: {
  artifact: Artifact;
  revision: string;
  document: EngineeringDocumentRecord | null;
  details: Record<string, string>;
}) {
  const code = DEMO_CODE_PREVIEWS[artifact.id];
  if (code) {
    return (
      <section className="artifact-preview-content code-artifact-preview">
        <header><div><div className="eyebrow">CODE PREVIEW</div><p>{code.description}</p></div><span>{code.language}</span></header>
        <pre aria-label={`Code preview for ${artifact.label}`}><code>{code.code.split('\n').slice(0, 22).join('\n')}</code></pre>
        <small>Hypothetical demo source · preview only</small>
      </section>
    );
  }

  if (artifact.category === 'documents') {
    return (
      <section className="artifact-preview-content document-artifact-preview">
        <header><div><div className="eyebrow">DOCUMENT PREVIEW</div><p>{document?.summary ?? 'Engineering document attached to the rover product record.'}</p></div><FileText size={19} /></header>
        <div className="preview-file-card"><FileText size={24} /><span><b>{document?.filename ?? artifact.meta}</b><small>{document?.artifactType ?? 'engineering document'} · {document?.mode ?? 'mock'}</small></span></div>
        {document?.properties.slice(0, 4).map((property) => <div className="preview-fact" key={property.key}><span>{property.label}</span><b>{property.value}</b><small>Source: {property.sourceName}</small></div>)}
        <small>{document?.inferencePerformed ? 'Parsed by the configured local service' : 'Prototype interpretation · no parser inference performed'}</small>
      </section>
    );
  }

  if (artifact.category === 'mechanical') {
    return (
      <section className="artifact-preview-content cad-artifact-preview">
        <header><div><div className="eyebrow">CAD RECORD PREVIEW</div><p>Released physical design record and graph-connected interfaces.</p></div><span>STEP</span></header>
        <div className="cad-preview-graphic"><Box size={44} /><i /><i /><span>{artifact.meta}</span></div>
        <div className="preview-fact"><span>Record</span><b>{artifact.meta}</b><small>Demo metadata only · no geometry was fabricated</small></div>
      </section>
    );
  }

  if (artifact.category === 'bom') {
    return (
      <section className="artifact-preview-content bom-artifact-preview">
        <header><div><div className="eyebrow">BOM PREVIEW</div><p>Released purchasing line connected to this product revision.</p></div><span>{revision}</span></header>
        <div className="preview-table"><span>PART</span><span>STATUS</span><b>{artifact.meta}</b><b>Released demo row</b>{details.Supplier && <><b>{details.Supplier}</b><b>{details['Unit Cost'] ?? 'Cost in Product state'}</b></>}</div>
        <small>Static demo sourcing data · not live inventory</small>
      </section>
    );
  }

  if (artifact.category === 'tests') {
    return (
      <section className="artifact-preview-content test-artifact-preview">
        <header><div><div className="eyebrow">TEST RECORD PREVIEW</div><p>Verification artifact connected to the product graph.</p></div><ShieldCheck size={20} /></header>
        <div className="preview-status"><CheckCircle2 size={17} /><span><b>{details.Status ?? 'Released'}</b><small>{artifact.meta} · result history is a demo record</small></span></div>
      </section>
    );
  }

  const previewLabel = artifact.category === 'pcb' ? 'ELECTRICAL PREVIEW'
    : artifact.category === 'manufacturing' ? 'BUILD RECORD PREVIEW'
      : artifact.category === 'suppliers' ? 'SOURCE RECORD PREVIEW'
        : artifact.category === 'agents' ? 'AGENT CONTRACT PREVIEW'
          : 'PRODUCT PREVIEW';
  return (
    <section className="artifact-preview-content generic-artifact-preview">
      <header><div><div className="eyebrow">{previewLabel}</div><p>{CATEGORY_META[artifact.category].label} artifact in the shared engineering state.</p></div><Layers3 size={20} /></header>
      <div className="preview-fact"><span>Identifier</span><b>{artifact.meta}</b><small>{artifact.code} · {revision}</small></div>
      <div className="preview-fact"><span>Status</span><b>{details.Status ?? 'Released'}</b><small>Inspect connected artifacts below for dependency context.</small></div>
    </section>
  );
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

function ArtifactAssetPanel({ artifact, document, onClose }: { artifact: Artifact; document: EngineeringDocumentRecord | null; onClose: () => void }) {
  const kind = artifact.category === 'documents' ? 'DOCUMENT'
    : artifact.category === 'bom' ? 'BOM RECORD'
      : artifact.category === 'mechanical' ? 'CAD RECORD'
        : 'ARTIFACT';
  const icon = artifact.category === 'documents' ? <FileText size={16} /> : <Box size={16} />;
  return (
    <section className="mode-panel asset-panel panel-enter">
      <div className="mode-panel-head"><div><span className="mode-icon">{icon}</span><div><div className="eyebrow">{kind}</div><h3>{artifact.label}</h3></div></div><button aria-label={`Close ${kind.toLowerCase()}`} onClick={onClose}><X size={15} /></button></div>
      {document ? (
        <>
          <p>{document.summary}</p>
          <div className={`document-disclosure ${document.mode}`}><span>{document.inferencePerformed ? document.mode === 'nvidia-build' ? 'Parsed with NVIDIA Build' : 'Parsed locally' : 'Validated fallback · no model inference'}</span><small>Parser role: {document.parserRole}</small></div>
          {document.previewUrl && document.mimeType === 'application/pdf'
            ? <iframe className="artifact-document-frame" title={`Preview of ${document.filename}`} src={document.previewUrl} />
            : <div className="artifact-file-card"><FileText size={28} /><div><b>{document.filename}</b><span>{document.artifactType}{document.component ? ` · ${document.component}` : ''}</span></div></div>}
          <div className="document-fact-list"><div className="eyebrow">SOURCED FACTS</div>{document.properties.length ? document.properties.map((property) => <div key={`${property.sourceId}-${property.key}`}><span>{property.label}</span><b>{property.value}</b><small>Source: {property.sourceName}</small></div>) : <p>No structured facts were extracted from this document.</p>}</div>
        </>
      ) : artifact.category === 'bom' ? (
        <>
          <p>Released purchasing record connected to the engineering graph.</p>
          <div className="artifact-record-grid"><span>Part</span><b>{artifact.meta}</b><span>Graph ID</span><b>{artifact.id}</b><span>Status</span><b>Released demo record</b></div>
          <div className="demo-mode-note"><b>Demo BOM</b><span>This panel displays the current product-graph record; it is not connected to a live ERP system.</span></div>
        </>
      ) : (
        <>
          <p>Physical design record for this graph artifact.</p>
          <div className="artifact-record-grid"><span>Record</span><b>{artifact.meta}</b><span>Format</span><b>{artifact.code.includes('STEP') ? 'STEP' : 'Assembly'}</b><span>Status</span><b>Released demo record</b></div>
          <div className="demo-mode-note"><b>Demo CAD record</b><span>No geometry file is fabricated here. Camera Mount proposals can hand off to the existing local OpenCAD workflow.</span></div>
        </>
      )}
    </section>
  );
}

function ProductValidationSummary({ state }: { state: EngineeringState }) {
  const productState = state.productState;
  if (!productState) {
    return <div className="product-validation-summary pending"><AlertTriangle size={14} /><span><b>Product candidate pending</b><small>Prototype view · Python validation not yet committed</small></span></div>;
  }
  return (
    <div className="product-validation-summary"><ShieldCheck size={14} /><span><b>Validated Product · {productState.revision}</b><small>{productState.product.components.length} components · {productState.product.relationships.length} relationships · {productState.product.circuit.nets.length} nets</small></span></div>
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
        <div className="source-count"><FileText size={13} /><span><b>{build.sources.length} input source{build.sources.length === 1 ? '' : 's'}</b>Prompt, media, documents, and constraints retained</span></div>
        <ProductValidationSummary state={state} />
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
      <ProductValidationSummary state={state} />
      <div className="sidebar-note"><CircleDot size={14} /><span><strong>Shared project state</strong>Beginner and Pro stay in sync</span></div>
    </div>
  );
}

function GuidedPanel({ state, query, loading, error, onQuery, onRun, onAccept, onOpenCad, onShowPro, onOpenScanner, onAnalyzeJ12, onConstraint }: {
  state: EngineeringState;
  query: string;
  loading: boolean;
  error: string;
  onQuery: (query: string) => void;
  onRun: (query: string) => void;
  onAccept: () => void;
  onOpenCad: () => void;
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
        <div className="generated-build-facts"><span><b>{build.architecture.artifacts.length}</b> concept artifacts</span><span><b>{build.architecture.relations.length}</b> relationships</span><span><b>{build.sources.length}</b> input sources</span></div>
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
  const realization = state.physicalRealizations[state.physicalRealizations.length - 1] ?? null;

  return (
    <div className="guided-panel">
      <div className="mode-panel-head"><div><span className="mode-icon"><Sparkles size={16} /></span><div><div className="eyebrow">STEP-BY-STEP WORKFLOW</div><h3>Beginner</h3></div></div><button onClick={onShowPro} aria-label="Open Pro workspace"><SlidersHorizontal size={15} /></button></div>
      {!proposal ? (
        <>
          <div className="guided-hero"><span>STEP 1 · REQUEST</span><h2>What do you want the rover to achieve?</h2><p>Describe the result. Forma Labs checks which parts, files, and constraints are affected.</p></div>
          <label className="guided-objective"><textarea value={query} onChange={(event) => onQuery(event.target.value)} placeholder="For example: Increase payload by 30%" /><button disabled={loading} onClick={() => onRun(query || 'Increase payload capacity')}><Sparkles size={14} /> {loading ? 'Checking project data…' : 'Generate change proposal'}</button></label>
          <div className="guided-examples"><button onClick={() => { onQuery('Increase payload capacity'); onRun('Increase payload capacity'); }}>Increase payload 30% <ChevronRight size={12} /></button><button onClick={() => { onQuery('Increase runtime to 4 hours without changing mission duty cycle.'); onRun('Increase runtime to 4 hours without changing mission duty cycle.'); }}>Reach four-hour runtime <ChevronRight size={12} /></button><button onClick={() => { const objective = 'Make the rover camera mount 25 mm taller so it can see over a 90 mm obstacle.'; onQuery(objective); onRun(objective); }}>Raise camera mount 25 mm <ChevronRight size={12} /></button><button onClick={onAnalyzeJ12}>Replace unavailable J12 <ChevronRight size={12} /></button></div>
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
          {proposal.openCad.required && proposal.status === 'validated' && <div className="guided-physical-change"><div><Wrench size={16} /><span><small>PHYSICAL DESIGN CHANGE REQUIRED</small><b>{proposal.changed[0]?.artifactId === 'camera-mount' ? `Camera Mount · ${proposal.changed[0].before.replace('mount height ', '')} → ${proposal.changed[0].after.replace('mount height ', '')}` : `${proposal.changed.length} physical parameter${proposal.changed.length === 1 ? '' : 's'} to realize`}</b></span></div><p>Forma isolated the required parameter change. OpenCAD must rebuild and validate the geometry before {proposal.targetRevision} can be created.</p><button onClick={onOpenCad}><Box size={13} /> Adjust Physical Design <ChevronRight size={12} /></button></div>}
          {accepted && realization && <div className={`guided-realization-result ${realization.toolMode}`}><div>{realization.toolMode === 'local' ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}<span><small>{realization.toolMode === 'local' ? 'OPENCAD RESULT' : 'SIMULATED DEMO RESULT'}</small><b>Camera Mount Updated</b></span></div><p>Height increased to {realization.requestedChange.heightMm.to} mm. Chassis and camera clearance checks passed.</p><small>{realization.toolMode === 'local' ? 'Real OCCT geometry rebuilt locally.' : 'No OpenCAD operation or CAD file was generated.'}</small></div>}
          {showWhy && <div className="guided-why panel-enter"><b>Why this change?</b><p>{proposal.why}</p><b>Next action</b><p>{proposal.nextAction}</p></div>}
          <div className="guided-actions">
            {proposal.status === 'validated' && !proposal.openCad.required && <button className="primary" onClick={onAccept}><Check size={13} /> Accept and create {proposal.targetRevision}</button>}
            {proposal.status === 'validated' && proposal.openCad.required && <button className="primary" onClick={onOpenCad}><Wrench size={13} /> Adjust Physical Design</button>}
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
        {source.kind === 'image'
          ? <img src={source.url} alt={`Input source ${source.name}`} />
          : source.kind === 'video'
            ? <video src={source.url} controls preload="metadata" />
            : <div className="input-document-thumb"><FileText size={24} /><span>{source.name.split('.').pop()?.toUpperCase() || 'DOC'}</span></div>}
        <div><b>{source.name}</b><span>{source.kind === 'image' ? 'Image reference' : source.kind === 'video' ? 'Video reference' : 'Document source'}</span></div>
      </article>)}</div>}
      <div className="input-constraint-chips">{build.intent.requirements.map((requirement) => <span key={requirement.key}><b>{requirement.label}</b>{requirement.value}</span>)}</div>
      {build.intent.documentObservations.length > 0 && <div className="input-document-facts"><div className="eyebrow">DOCUMENT INTERPRETATIONS</div>{build.intent.documentObservations.map((document) => <article key={document.sourceId}><header><b>{document.title}</b><span>{document.mode} · {document.inferencePerformed ? 'local parser' : 'no model inference'}</span></header>{document.properties.map((property) => <div key={property.key}><span>{property.label}</span><b>{property.value}</b><small>Source: {property.sourceName}</small></div>)}</article>)}</div>}
      {build.additionalNotes && <div className="input-notes"><span>ADDITIONAL NOTES</span><p>{build.additionalNotes}</p></div>}
      <div className="demo-mode-note"><b>Source-aware build inputs</b><span>Text, notes, media observations, and document extractions are carried into the same structured build intent. Any unavailable modality is labeled as a fallback.</span></div>
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

function ProposalCard({ proposal, realization, experience, onAccept, onOpenCad, onShowGraph, onShowPro }: {
  proposal: EngineeringProposal;
  realization: OpenCadRealizationRecord | null;
  experience: ExperienceMode;
  onAccept: () => void;
  onOpenCad: () => void;
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
          <div className={`opencad-handoff ${proposal.openCad.status}`}><Wrench size={14} /><div><b>{proposal.openCad.required ? 'OpenCAD physical realization' : 'Geometry decision'}</b><span>{proposal.openCad.status === 'realized' ? 'Real OCCT geometry rebuilt locally' : proposal.openCad.status === 'simulated' ? 'Simulated preview only; no CAD files generated' : proposal.openCad.required ? 'Local rebuild required before revision creation' : proposal.openCad.operations[0] === 'No geometry mutation is required for this proposal.' ? 'No physical geometry mutation required' : 'CAD follow-up recorded; focused realization is not mapped for this artifact'} · {proposal.openCad.operations[0]}</span></div>{proposal.openCad.required && proposal.status === 'validated' && <button onClick={onOpenCad}>Open <ChevronRight size={11} /></button>}</div>
          {realization && proposal.openCad.realizationId === realization.featureId && <div className="opencad-result-detail"><div className="eyebrow">PHYSICAL REALIZATION</div><dl><dt>Artifact ID</dt><dd>{realization.artifactId}</dd><dt>Parameter</dt><dd>{realization.requestedChange.heightMm.from} → {realization.requestedChange.heightMm.to} mm</dd><dt>Operation</dt><dd>{realization.operation.name}</dd><dt>Backend</dt><dd>{realization.operation.backend}</dd><dt>Feature tree</dt><dd>{realization.operation.treeId ?? 'simulation only'}</dd><dt>Validation</dt><dd>{realization.validation.status}</dd></dl>{realization.toolMode === 'local' && <div>{realization.outputs.step && <a href={realization.outputs.step}>Download STEP</a>}{realization.outputs.stl && <a href={realization.outputs.stl}>Download STL</a>}</div>}</div>}
          <EvidenceList evidence={proposal.evidence} limit={3} />
        </>
      ) : <div className="guided-card-copy"><b>Why</b><span>{proposal.why}</span><b>Next</b><span>{proposal.nextAction}</span></div>}
      <div className="affected-line"><span>{proposal.affectedArtifactIds.length} affected · {proposal.changed.length} changed</span><div>{proposal.status === 'validated' && !proposal.openCad.required && <button className="commit-button" onClick={onAccept}><Check size={11} /> Create {proposal.targetRevision}</button>}{proposal.status === 'validated' && proposal.openCad.required && <button className="commit-button" onClick={onOpenCad}><Wrench size={11} /> Open in OpenCAD</button>}{experience === 'guided' && <button onClick={onShowPro}>Details</button>}<button onClick={onShowGraph}>Graph <ChevronRight size={12} /></button></div></div>
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
    const maxBytes = isVideo ? 60 * 1024 * 1024 : 15 * 1024 * 1024;
    if (nextFile.size > maxBytes) { setError(`Choose a ${isVideo ? 'video smaller than 60 MB' : 'photo smaller than 15 MB'}.`); return; }
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
      const analyzed = await analyzeWithConfiguredInference(demoFile, matchOptions);
      const result = analyzed.status === 'matched' || !demoTarget
        ? analyzed
        : { ...localScannerAdapter.confirmArtifact(demoTarget.id, demoTarget.label), explanation: 'Explicit sample-scan fallback used after the live vision adapter did not produce a graph match.' };
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
      const result: ScannerAnalysis = await analyzeWithConfiguredInference(file, matchOptions);
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
      <p>Take a photo, upload a photo, or upload a video, then link the observed hardware to the product graph.</p>
      <input ref={cameraInput} hidden type="file" accept="image/*" capture="environment" onChange={(event) => acquire(event.target.files?.[0] ?? null)} />
      <input ref={photoInput} hidden type="file" accept="image/*" onChange={(event) => acquire(event.target.files?.[0] ?? null)} />
      <input ref={videoInput} hidden type="file" accept="video/*" onChange={(event) => acquire(event.target.files?.[0] ?? null)} />
      <div className={`scanner-view ${activeMatch ? 'matched' : ''} ${previewUrl ? 'has-media' : ''}`}>
        {previewUrl ? (mediaKind === 'video' ? <video src={previewUrl} controls playsInline preload="metadata" /> : <img src={previewUrl} alt="Locally acquired scanner input" />) : <div className="rover-silhouette"><div className="rover-body" /><div className="rover-camera" /><i className="wheel one" /><i className="wheel two" /><i className="connector-target" /></div>}
        {(analyzing || (previewUrl && !analysis)) && <div className="scan-line" />}
        {activeMatch && <div className="detected-bounds" style={{ left: `${activeMatch.bounds.x}%`, top: `${activeMatch.bounds.y}%`, width: `${activeMatch.bounds.width}%`, height: `${activeMatch.bounds.height}%` }}><span>{activeMatch.label}</span></div>}
        <div className="scan-readout"><span>{file ? file.name : 'NO MEDIA ACQUIRED'}</span><span>{activeMatch?.mode === 'nvidia-build-vision' ? 'LIVE NVIDIA VISION' : activeMatch?.mode === 'huggingface-vision' ? 'LIVE HUGGING FACE VISION' : activeMatch?.mode === 'manual-observation' ? 'DEMO / USER LINK' : activeMatch ? 'VALIDATED FALLBACK' : mediaKind === 'video' ? 'VIDEO INPUT' : 'PHOTO INPUT'}</span></div>
      </div>
      <div className="scanner-input-actions"><button onClick={() => cameraInput.current?.click()}><Camera size={13} /> Take Photo</button><button onClick={() => photoInput.current?.click()}><Upload size={13} /> Upload Photo</button><button onClick={() => videoInput.current?.click()}><Film size={13} /> Upload Video</button></div>
      <button className="demo-asset-button" disabled={analyzing} onClick={() => void runSampleScan()}><Play size={13} /> {analyzing ? 'Running sample scan…' : 'Run sample scan'}</button>
      <div className="demo-mode-note"><b>Live analysis by default</b><span>Uploaded media uses the configured server-side vision adapter. “Run sample scan” is the only path that may use the labeled demo fixture.</span></div>
      {file && !analysis && <button className="scan-button" disabled={analyzing} onClick={() => void analyze()}><ScanLine size={15} /> {analyzing ? 'Analyzing input…' : `Analyze ${mediaKind === 'video' ? 'video' : 'photo'}`}</button>}
      {analysis?.status === 'needs-confirmation' && <div className="manual-match"><div className="scanner-disclosure"><AlertTriangle size={13} /><span>{analysis.explanation}</span></div><div>{matchOptions.map(([id, label]) => <button key={id} onClick={() => confirm(id, label)}>{label}<ChevronRight size={11} /></button>)}</div></div>}
      {activeMatch && <div className="scanner-status"><span className="scanner-status-icon"><Check size={15} /></span><div><strong>{activeMatch.label} linked</strong><small>Product graph · {revision} · {activeMatch.confidence ? `${Math.round(activeMatch.confidence * 100)}% ${activeMatch.mode === 'nvidia-build-vision' || activeMatch.mode === 'huggingface-vision' ? 'live vision' : 'demo'} match` : 'confirmed manually'}</small></div></div>}
      {activeMatch && <><div className="scanner-disclosure"><Info size={13} /><span>{activeMatch.explanation}</span></div><button className={`fixed-part-button ${isFixed ? 'fixed' : ''}`} onClick={() => onToggleFixed(activeMatch.artifactId)}><Lock size={13} /> {isFixed ? 'Fixed constraint added' : 'Use as a fixed constraint'}</button></>}
      <div className="runtime-note"><Cable size={15} /><div><b>Server-routed multimodal input</b><span>Photos are analyzed directly; videos are decoded into sampled timeline frames. Graph links still require a known candidate or user confirmation.</span></div></div>
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

function AgentPanel({ productCandidateId, onClose, onArtifacts }: { productCandidateId?: ProductCandidateId; onClose: () => void; onArtifacts: (ids: string[]) => void }) {
  const agents = [
    { kind: 'product' as const, name: 'Product Agent', copy: 'Traces dependencies and revision impact', Icon: Cpu },
    { kind: 'supply' as const, name: 'Supply Agent', copy: 'Checks stock, lead time, and alternatives', Icon: Activity },
    { kind: 'builder' as const, name: 'Builder Agent', copy: 'Creates evidence-backed change plans', Icon: Box },
  ];
  const [activeAgent, setActiveAgent] = useState<AgentKind>('product');
  const [question, setQuestion] = useState(AGENT_PROMPTS.product);
  const [answer, setAnswer] = useState<AgentResponse | null>(null);
  const [health, setHealth] = useState<CorpusHealth | null>(null);
  const [inferenceStatus, setInferenceStatus] = useState<FormaInferenceStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [demoAnswer, setDemoAnswer] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch('/api/health', { signal: controller.signal })
        .then((response) => response.ok ? response.json() as Promise<CorpusHealth> : Promise.reject(new Error('Corpus unavailable')))
        .then(setHealth),
      fetch('/api/inference/status?probe=1', { signal: controller.signal })
        .then((response) => response.ok ? response.json() as Promise<FormaInferenceStatus> : Promise.reject(new Error('Inference status unavailable')))
        .then(setInferenceStatus),
    ]).catch((cause: Error) => { if (cause.name !== 'AbortError') setError(cause.message); });
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
      const result = await askAgent(activeAgent, submittedQuestion, productCandidateId, demo);
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
      <div className="demo-mode-note"><b>{inferenceStatus?.connected ? 'Live NVIDIA reasoning' : 'Live inference unavailable'}</b><span>{inferenceStatus?.connected ? 'The selected NVIDIA model reasons over bundled project evidence; artifact IDs and validated engineering state remain protected.' : 'Normal questions require the hosted model. The sample button remains available as an explicitly labeled dataset demonstration.'}</span></div>
      <label className="agent-query"><span>ASK {activeAgent.toUpperCase()}</span><textarea value={question} onChange={(event) => { setQuestion(event.target.value); setDemoAnswer(false); }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); } }} /><button disabled={loading} onClick={() => void submit()}><Send size={13} /> {loading && !demoAnswer ? 'Reading project files...' : 'Search project data'}</button></label>
      {error && <div className="backend-error">{error}</div>}
      {answer && (
        <div className="agent-response panel-enter">
          <div className="agent-response-head"><span>{demoAnswer ? 'SAMPLE ANSWER' : answer.mode === 'ground-truth' ? 'MATCHED DATASET ANSWER' : 'SEARCH RESULT'}</span><b>{Math.round(answer.confidence * 100)}% evidence · {answer.latencyMs >= 1000 ? `${(answer.latencyMs / 1000).toFixed(1)}s` : `${answer.latencyMs}ms`}</b></div>
          <p>{answer.answer}</p>
          <div className="agent-artifacts">{answer.artifactIds.slice(0, 8).map((id) => <span key={id}>{id}</span>)}</div>
          <EvidenceList evidence={answer.evidence} limit={3} />
        </div>
      )}
      <div className="runtime-note"><Cable size={15} /><div><b>{inferenceStatus ? `${inferenceStatus.provider} · ${inferenceStatus.connected ? 'connected' : inferenceStatus.mode}` : 'Checking inference provider'}</b><span>{inferenceStatus ? `${inferenceStatus.services.find((service) => service.capability === 'reasoning')?.model ?? 'No reasoning model'} · ${inferenceStatus.disclosure}` : 'Loading server-only provider status…'}</span></div></div>
    </div>
  );
}
