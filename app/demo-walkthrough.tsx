'use client';

import {
  ArrowRight,
  Check,
  CheckCircle2,
  CircleX,
  FileText,
  FileJson2,
  Gauge,
  Pause,
  Play,
  RefreshCcw,
  ShieldCheck,
  SkipForward,
  Sparkles,
  X,
} from 'lucide-react';
import { DEMO_FEATURES, DEMO_STAGES, type DemoStage } from '@/lib/demo-walkthrough';

export type DemoRuntime = {
  active: boolean;
  paused: boolean;
  step: number;
  runId: number;
};

type Props = {
  runtime: DemoRuntime;
  revision: string;
  onPause: () => void;
  onRestart: () => void;
  onSkip: () => void;
  onExit: () => void;
};

function IntentStage() {
  const data = DEMO_FEATURES.multimodal_intent;
  return (
    <>
      <div className="demo-prompt"><Sparkles size={16} /><span>{data.objective}</span></div>
      <div className="demo-thinking"><i /><span>Understanding engineering intent</span><b>Mock</b></div>
      <div className="demo-extracted">
        {data.extracted.map((item) => <div key={item.label}><span>{item.label}</span><b>{item.value}</b></div>)}
      </div>
      <div className="demo-document-source"><FileText size={13} /><span><b>Motor M4 Datasheet</b><small>Prototype document interpretation · no model inference</small></span></div>
    </>
  );
}

function ConstraintsStage() {
  const data = DEMO_FEATURES.clarify_constraints;
  return (
    <div className="demo-constraint-columns">
      <section><span>LOCKED</span>{data.fixed.map((item) => <div key={item}><ShieldCheck size={13} /><b>{item}</b></div>)}</section>
      <section><span>CAN CHANGE</span>{data.mutable.map((item) => <div key={item}><Check size={13} /><b>{item}</b></div>)}</section>
    </div>
  );
}

function ImpactStage() {
  const data = DEMO_FEATURES.impact_analysis;
  return (
    <>
      <div className="demo-stat"><b>{data.affected_systems.length}</b><span>affected systems traced through the live product graph</span></div>
      <div className="demo-impact-list">{data.affected_systems.map((system, index) => <div key={system.label}><i>{index + 1}</i><span><b>{system.label}</b><small>{system.artifact_ids.join(', ')}</small></span></div>)}</div>
    </>
  );
}

function CandidateStage() {
  const data = DEMO_FEATURES.part_substitution;
  return (
    <>
      <div className="demo-substitution"><span>{data.current_part}</span><ArrowRight size={16} /><b>{data.selected_part}</b><small>{data.selected_part_number}</small></div>
      <div className="demo-candidates">{data.candidates.map((candidate) => <div className={candidate.status} key={candidate.id}>{candidate.status === 'selected' ? <CheckCircle2 size={14} /> : <CircleX size={14} />}<span><b>{candidate.label}</b><small>{candidate.reason}</small></span></div>)}</div>
      <div className="demo-reason-chips">{data.reasons.map((reason) => <span key={reason}>{reason}</span>)}</div>
    </>
  );
}

function ValidationStage() {
  const data = DEMO_FEATURES.validation;
  return (
    <div className="demo-checks">{data.checks.map((check) => <div className={check.status} key={check.label}>{check.status === 'pass' ? <CheckCircle2 size={15} /> : <Gauge size={15} />}<span>{check.label}</span><b>{check.status}</b></div>)}</div>
  );
}

function RevisionStage() {
  const data = DEMO_FEATURES.revision_update;
  return (
    <>
      <div className="demo-revision-change"><span>{data.from_revision}</span><ArrowRight size={18} /><b>{data.to_revision}</b></div>
      <p className="demo-principle">{data.principle}</p>
      <div className="demo-revision-counts"><div><b>{data.changed_artifact_ids.length}</b><span>changed</span></div><div><b>{data.preserved_artifact_ids.length}</b><span>explicitly preserved</span></div></div>
      <div className="demo-artifact-chips">{data.changed_artifact_ids.map((id) => <span key={id}>{id}</span>)}</div>
    </>
  );
}

function GuidedStage() {
  const result = DEMO_FEATURES.revision_update.guided_result;
  return (
    <div className="demo-guided-result">
      <div><CheckCircle2 size={24} /><span><small>REV D READY</small><b>{result.headline}</b></span></div>
      <dl><dt>Changed</dt><dd>{result.changed.join(' · ')}</dd><dt>Tradeoff</dt><dd>{result.tradeoff}</dd><dt>Next</dt><dd>{result.next_action}</dd></dl>
    </div>
  );
}

function ProStage() {
  const data = DEMO_FEATURES.revision_update;
  return (
    <>
      <div className="demo-pro-metrics">{data.pro_evidence.map((item) => <div key={item.label}><span>{item.label}</span><b>{item.value}</b></div>)}</div>
      <div className="demo-complete"><CheckCircle2 size={17} /><span><b>Demo complete</b><small>The graph, revision history, Beginner view, and Pro evidence all read the same shared Rev D state.</small></span></div>
    </>
  );
}

function StageContent({ stage }: { stage: DemoStage }) {
  if (stage.phase === 'intent') return <IntentStage />;
  if (stage.phase === 'constraints') return <ConstraintsStage />;
  if (stage.phase === 'graph') return <ImpactStage />;
  if (stage.phase === 'candidate') return <CandidateStage />;
  if (stage.phase === 'validation') return <ValidationStage />;
  if (stage.phase === 'revision') return <RevisionStage />;
  if (stage.phase === 'guided') return <GuidedStage />;
  return <ProStage />;
}

export function DemoWalkthrough({ runtime, revision, onPause, onRestart, onSkip, onExit }: Props) {
  if (!runtime.active) return null;
  const stage = DEMO_STAGES[runtime.step] ?? DEMO_STAGES[0];
  const complete = runtime.step === DEMO_STAGES.length - 1;
  const progress = ((runtime.step + 1) / DEMO_STAGES.length) * 100;
  return (
    <div className={`demo-layer demo-phase-${stage.phase}`} role="dialog" aria-modal="false" aria-label="Forma Labs guided demo">
      <div className="demo-backdrop" />
      <section className="demo-walkthrough">
        <header>
          <div className="demo-tour-title"><span className="demo-tour-mark"><Play size={13} /></span><div><small>FORMA LABS WALKTHROUGH</small><b>{stage.label}</b></div></div>
          <div className="demo-stage-number"><span>{runtime.step + 1}</span> / {DEMO_STAGES.length}</div>
          <button onClick={onExit} aria-label="Exit demo"><X size={16} /></button>
        </header>
        <div className="demo-progress"><i style={{ width: `${progress}%` }} /></div>
        <div className="demo-feature"><FileJson2 size={12} /><span>{stage.feature}.json</span><b>source of truth</b></div>
        <div className="demo-stage-body"><StageContent stage={stage} /></div>
        <footer>
          <div className="demo-live-state"><i /><span>{revision} · shared engineering state</span></div>
          <div className="demo-controls">
            <button onClick={onRestart} title="Restart demo"><RefreshCcw size={14} /><span>Restart</span></button>
            {!complete && <button onClick={onPause} title={runtime.paused ? 'Resume demo' : 'Pause demo'}>{runtime.paused ? <Play size={14} /> : <Pause size={14} />}<span>{runtime.paused ? 'Resume' : 'Pause'}</span></button>}
            {!complete && <button onClick={onSkip} title="Skip step"><SkipForward size={14} /><span>Skip</span></button>}
            {complete && <button className="demo-done" onClick={onExit}><Check size={14} /><span>Keep exploring</span></button>}
          </div>
        </footer>
      </section>
    </div>
  );
}
