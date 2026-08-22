'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Box, CheckCircle2, ChevronRight, Download, LoaderCircle, RotateCcw, Ruler, ShieldCheck, SlidersHorizontal, Wrench, X } from 'lucide-react';
import type { ExperienceMode } from '@/lib/engineering-state';
import type { OpenCadMesh, OpenCadRealizationRecord, OpenCadRealizationResponse } from '@/lib/opencad-adapter';
import { OpenCadMeshViewport } from './opencad-mesh-viewport';

type OpenCadStatus = {
  mode: 'local' | 'unavailable';
  available: boolean;
  backend: string | null;
  occt: boolean;
  baseUrl: string;
  viewportUrl: string;
  message: string;
};

function boxMesh(shapeId: string, length: number, width: number, height: number): OpenCadMesh {
  const x = length / 2;
  const y = width / 2;
  const vertices = [-x,-y,0, x,-y,0, x,y,0, -x,y,0, -x,-y,height, x,-y,height, x,y,height, -x,y,height];
  const faces = [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];
  return { shapeId, vertices, faces, normals: [] };
}

function simulatedResult(heightMm: number, clearanceMm: number, fromRevision: string, toRevision: string): OpenCadRealizationResponse {
  const checks = [
    { key: 'geometry' as const, label: 'Simulated geometry preview', status: 'warn' as const, detail: 'No OpenCAD operation ran and no CAD file was generated.', source: 'opencad' as const },
    { key: 'chassis_clearance' as const, label: 'Fits current chassis', status: heightMm <= 120 ? 'pass' as const : 'fail' as const, detail: `${heightMm} mm remains inside the demo chassis envelope.`, source: 'forma' as const },
    { key: 'camera_clearance' as const, label: 'Camera clears enclosure', status: heightMm >= 100 ? 'pass' as const : 'warn' as const, detail: `${heightMm - 90} mm above the demo sight obstruction.`, source: 'forma' as const },
    { key: 'cable_clearance' as const, label: 'Cable routing remains valid', status: clearanceMm >= 8 ? 'pass' as const : 'warn' as const, detail: `${clearanceMm} mm demo service-loop clearance.`, source: 'forma' as const },
    { key: 'wall_thickness' as const, label: 'Minimum wall thickness preserved', status: 'pass' as const, detail: '4 mm mounting section retained in the demo contract.', source: 'forma' as const },
  ];
  return {
    featureId: `geometry-camera-mount-sim-${heightMm}`,
    featureType: 'physical_realization',
    status: 'simulated',
    artifactId: 'camera-mount',
    artifactLabel: 'Camera Mount',
    tool: 'opencad',
    toolMode: 'simulated',
    fromRevision,
    toRevision,
    requestedChange: { heightMm: { from: 80, to: heightMm }, clearanceMm },
    operation: { name: 'create_box', backend: 'simulated-preview', treeId: null, treeRevision: null, shapeId: null },
    validation: {
      status: checks.some((check) => check.status === 'fail') ? 'invalid' : 'valid',
      checks,
    },
    outputs: { step: null, stl: null },
    meshes: { current: boxMesh('sim-current', 54, 30, 80), proposed: boxMesh('sim-proposed', 54, 30, heightMm) },
    currentTree: null,
    proposedTree: null,
  };
}

export function OpenCadWorkspace({ experience, fromRevision, toRevision, initialHeightMm, autoRebuild = false, onApply, onClose }: {
  experience: ExperienceMode;
  fromRevision: string;
  toRevision: string;
  initialHeightMm: number;
  autoRebuild?: boolean;
  onApply: (result: OpenCadRealizationRecord) => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<OpenCadStatus | null>(null);
  const [heightMm, setHeightMm] = useState(initialHeightMm);
  const [clearanceMm, setClearanceMm] = useState(8);
  const [result, setResult] = useState<OpenCadRealizationResponse | null>(null);
  const [view, setView] = useState<'current' | 'proposed'>('proposed');
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState('');
  const autoStarted = useRef(false);

  const rebuild = useCallback(async () => {
    setRebuilding(true);
    setError('');
    try {
      const response = await fetch('/api/opencad/realize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ heightMm, clearanceMm, fromRevision, toRevision }),
      });
      const payload = await response.json() as OpenCadRealizationResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'OpenCAD rebuild failed.');
      setResult(payload);
      setView('proposed');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'OpenCAD rebuild failed.');
    } finally {
      setRebuilding(false);
    }
  }, [clearanceMm, fromRevision, heightMm, toRevision]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/opencad/status', { signal: controller.signal, cache: 'no-store' })
      .then((response) => response.json() as Promise<OpenCadStatus>)
      .then(setStatus)
      .catch(() => setStatus({ mode: 'unavailable', available: false, backend: null, occt: false, baseUrl: '', viewportUrl: '', message: 'OpenCAD unavailable. Start the local OpenCAD service to edit physical geometry.' }));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (autoRebuild && status?.available && status.occt && !autoStarted.current) {
      autoStarted.current = true;
      void rebuild();
    }
  }, [autoRebuild, rebuild, status]);

  const mesh = result?.meshes[view] ?? null;
  const valid = result?.validation.status === 'valid';
  const localResult = result?.toolMode === 'local';
  const parametersValid = Number.isFinite(heightMm) && heightMm >= 85 && heightMm <= 120 && Number.isFinite(clearanceMm) && clearanceMm >= 0 && clearanceMm <= 20;
  const record = useMemo(() => {
    if (!result) return null;
    return {
      featureId: result.featureId,
      featureType: result.featureType,
      status: result.status,
      artifactId: result.artifactId,
      artifactLabel: result.artifactLabel,
      tool: result.tool,
      toolMode: result.toolMode,
      fromRevision: result.fromRevision,
      toRevision: result.toRevision,
      requestedChange: result.requestedChange,
      operation: result.operation,
      validation: result.validation,
      outputs: result.outputs,
    } satisfies OpenCadRealizationRecord;
  }, [result]);

  return (
    <div className="opencad-overlay" role="dialog" aria-modal="true" aria-label="OpenCAD physical design workspace">
      <section className={`opencad-workspace ${experience}`}>
        <header>
          <div className="opencad-heading"><span><Box size={17} /></span><div><small>PHYSICAL REALIZATION · OPENCAD</small><h2>Camera Mount</h2></div></div>
          <div className={`opencad-connection ${status?.available && status.occt ? 'online' : 'offline'}`}><i /><span>{status ? status.available && status.occt ? `LOCAL · ${status.backend?.toUpperCase()}` : 'UNAVAILABLE' : 'CHECKING LOCAL SERVICE'}</span></div>
          <button onClick={onClose} aria-label="Close OpenCAD workspace"><X size={17} /></button>
        </header>

        <div className="opencad-demo-flow"><span className="done">Intent</span><ChevronRight size={11} /><span className="done">Camera Mount</span><ChevronRight size={11} /><span className="active">OpenCAD</span><ChevronRight size={11} /><span>Validation</span><ChevronRight size={11} /><span>{toRevision}</span></div>

        <div className="opencad-main">
          <div className="opencad-visual">
            <div className="opencad-view-toolbar"><div><button className={view === 'current' ? 'active' : ''} onClick={() => setView('current')}>Current · 80 mm</button><button className={view === 'proposed' ? 'active' : ''} onClick={() => setView('proposed')}>Proposed · {heightMm} mm</button></div><span>DRAG TO ORBIT · SCROLL TO ZOOM</span></div>
            <OpenCadMeshViewport mesh={mesh} />
            {result?.toolMode === 'simulated' && <div className="opencad-simulated-badge"><AlertTriangle size={12} /> SIMULATED GEOMETRY PREVIEW · NO OPENCAD OPERATION RAN</div>}
            {result?.toolMode === 'local' && <div className="opencad-real-badge"><CheckCircle2 size={12} /> LIVE OPENCAD MESH · {result.operation.backend.toUpperCase()}</div>}
          </div>

          <aside className="opencad-controls">
            <div className="opencad-change-summary"><small>FORMA REQUEST</small><b>Increase mount height</b><div><span>80 mm</span><ChevronRight size={14} /><strong>{heightMm} mm</strong></div><p>Keep CHS-240 and validate sight-line and cable clearance.</p></div>
            <div className="opencad-parameters">
              <div className="eyebrow">RELEVANT PARAMETERS</div>
              <label><span><Ruler size={12} /> Height <small>85–120 mm</small></span><div><input type="number" min="85" max="120" value={heightMm} onChange={(event) => { setHeightMm(Number(event.target.value)); setResult(null); }} /><b>mm</b></div></label>
              <label><span><SlidersHorizontal size={12} /> Cable clearance <small>minimum 8 mm</small></span><div><input type="number" min="0" max="20" value={clearanceMm} onChange={(event) => { setClearanceMm(Number(event.target.value)); setResult(null); }} /><b>mm</b></div></label>
            </div>
            <button className="opencad-rebuild" disabled={rebuilding || !parametersValid || !status?.available || !status.occt} onClick={() => void rebuild()}>{rebuilding ? <LoaderCircle className="spin" size={14} /> : <RotateCcw size={14} />}{rebuilding ? 'Rebuilding feature tree…' : 'Rebuild with OpenCAD'}</button>
            {status && (!status.available || !status.occt) && <div className="opencad-unavailable"><AlertTriangle size={14} /><div><b>OpenCAD unavailable</b><span>{status.message}</span></div></div>}
            {(!status?.available || !status.occt) && !result && <button className="opencad-simulate" disabled={!parametersValid} onClick={() => { setResult(simulatedResult(heightMm, clearanceMm, fromRevision, toRevision)); setView('proposed'); setError(''); }}><Box size={13} /> Load simulated preview</button>}
            {error && <div className="backend-error">{error}</div>}
          </aside>
        </div>

        <div className="opencad-lower">
          <section className="opencad-validation"><div className="eyebrow">VALIDATION</div>{result ? result.validation.checks.map((check) => <div className={check.status} key={check.key}>{check.status === 'pass' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}<span><b>{check.label}</b><small>{check.detail}</small></span><em>{check.source}</em></div>) : <p>Rebuild the proposed geometry to run physical checks.</p>}</section>
          {experience === 'pro' && <section className="opencad-technical"><div className="eyebrow">TECHNICAL RESULT</div>{result ? <><dl><dt>Artifact</dt><dd>{result.artifactId}</dd><dt>Operation</dt><dd>{result.operation.name}</dd><dt>Feature tree</dt><dd>{result.operation.treeId ?? 'none (simulation)'}</dd><dt>Tree revision</dt><dd>{result.operation.treeRevision ?? '—'}</dd><dt>Shape</dt><dd>{result.operation.shapeId ?? 'none'}</dd></dl>{localResult && <div className="opencad-downloads">{result.outputs.step && <a href={result.outputs.step}><Download size={12} /> STEP</a>}{result.outputs.stl && <a href={result.outputs.stl}><Download size={12} /> STL</a>}</div>}</> : <p>No physical realization result yet.</p>}</section>}
        </div>

        <footer>
          <div className="opencad-principle-line"><Wrench size={14} /><span><b>Forma decides what changes.</b> OpenCAD realizes the geometry.</span></div>
          <div><button onClick={onClose}>Cancel</button><button className="opencad-apply" disabled={!valid || !record} onClick={() => record && onApply(record)}>{localResult ? <ShieldCheck size={14} /> : <AlertTriangle size={14} />}{localResult ? 'Apply Change' : 'Apply simulated demo state'}</button></div>
        </footer>
      </section>
    </div>
  );
}
