'use client';

/* eslint-disable @next/next/no-img-element -- Local object URLs cannot use the Next image optimizer. */

import { useRef, useState, type DragEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, FileImage, Film, Info, LoaderCircle, Plus, Sparkles, Upload, X } from 'lucide-react';
import {
  analyzeIntent,
  synthesizeArchitecture,
  type ClarificationAnswers,
  type PrototypeArchitecture,
  type PrototypeBuildDefinition,
  type PrototypeInputSource,
  type PrototypeIntent,
  type PrototypeSourceKind,
} from '@/lib/new-build-adapter';
import { CATEGORY_META } from './product-data';

type Phase = 'input' | 'analyzing' | 'review' | 'architecture';

const EXAMPLE_PROMPTS = [
  'Build a warehouse inspection rover',
  'Design a portable air-quality monitor',
  'Make a small robotic camera platform',
  'Build a desktop pick-and-place machine',
];

const ANALYSIS_STAGES = [
  'Understanding objective',
  'Extracting constraints',
  'Identifying product systems',
  'Mapping reference media',
  'Generating initial architecture',
];

const QUESTIONS = [
  {
    key: 'terrain' as const,
    title: 'Where will it operate?',
    choices: ['Smooth indoor floors', 'Uneven industrial floors', 'Outdoor terrain'],
  },
  {
    key: 'priority' as const,
    title: 'What matters most?',
    choices: ['Balanced performance', 'Longer runtime', 'Higher payload', 'Smaller size'],
  },
  {
    key: 'budget' as const,
    title: 'Budget target?',
    choices: ['Under $500', 'Under $1,000', '$1,000+', 'Not sure'],
  },
];

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return 'Duration available in player';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function readVideoDuration(url: string) {
  return new Promise<number | undefined>((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => resolve(Number.isFinite(video.duration) ? video.duration : undefined);
    video.onerror = () => resolve(undefined);
    video.src = url;
  });
}

export function StartFromScratch({ onClose, onCreate }: { onClose: () => void; onCreate: (build: PrototypeBuildDefinition) => void }) {
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('input');
  const [prompt, setPrompt] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [sources, setSources] = useState<PrototypeInputSource[]>([]);
  const [intent, setIntent] = useState<PrototypeIntent | null>(null);
  const [architecture, setArchitecture] = useState<PrototypeArchitecture | null>(null);
  const [analysisIndex, setAnalysisIndex] = useState(0);
  const [answers, setAnswers] = useState<Partial<ClarificationAnswers>>({});
  const [error, setError] = useState('');

  const addFiles = async (files: File[], kind: PrototypeSourceKind) => {
    const validFiles = files.filter((file) => file.type.startsWith(`${kind}/`));
    if (!validFiles.length) { setError(`Choose a valid ${kind} file.`); return; }
    const maxBytes = kind === 'image' ? 15 * 1024 * 1024 : 120 * 1024 * 1024;
    if (validFiles.some((file) => file.size > maxBytes)) { setError(`${kind === 'image' ? 'Images' : 'Videos'} must be smaller than ${kind === 'image' ? '15' : '120'} MB.`); return; }

    const selectedFiles = kind === 'video' ? validFiles.slice(0, 1) : validFiles.slice(0, 3);
    const nextSources: PrototypeInputSource[] = [];
    for (const [index, file] of selectedFiles.entries()) {
      const url = URL.createObjectURL(file);
      nextSources.push({
        id: `${kind}-${Date.now()}-${index}`,
        kind,
        name: file.name,
        mimeType: file.type,
        url,
        sizeBytes: file.size,
        durationSeconds: kind === 'video' ? await readVideoDuration(url) : undefined,
      });
    }

    setSources((current) => {
      if (kind === 'video') {
        current.filter((source) => source.kind === 'video').forEach((source) => URL.revokeObjectURL(source.url));
        return [...current.filter((source) => source.kind !== 'video'), ...nextSources];
      }
      return [...current, ...nextSources].slice(0, 4);
    });
    setError('');
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, kind: PrototypeSourceKind) => {
    event.preventDefault();
    void addFiles(Array.from(event.dataTransfer.files), kind);
  };

  const removeSource = (id: string) => {
    setSources((current) => {
      const removed = current.find((source) => source.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      return current.filter((source) => source.id !== id);
    });
  };

  const loadDemoImage = async () => {
    setError('');
    try {
      const response = await fetch('/api/scanner/demo/rover');
      if (!response.ok) throw new Error('Demo rover image is unavailable.');
      const file = new File([await response.blob()], 'inspection-rover-reference.png', { type: 'image/png' });
      await addFiles([file], 'image');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the demo image.');
    }
  };

  const runAnalysis = async () => {
    if (prompt.trim().length < 10) { setError('Describe what you want to build before continuing.'); return; }
    setError('');
    setPhase('analyzing');
    setAnalysisIndex(0);
    const analysisPromise = analyzeIntent({ text: prompt.trim(), sources, additionalNotes: additionalNotes.trim() });
    for (let index = 0; index < ANALYSIS_STAGES.length; index += 1) {
      setAnalysisIndex(index);
      await new Promise((resolve) => window.setTimeout(resolve, 360));
    }
    const result = await analysisPromise;
    setIntent(result);
    setPhase('review');
  };

  const generateArchitecture = async () => {
    if (!intent || !answers.terrain || !answers.priority || !answers.budget) return;
    setPhase('analyzing');
    setAnalysisIndex(4);
    const result = await synthesizeArchitecture(intent, answers as ClarificationAnswers);
    setArchitecture(result);
    setPhase('architecture');
  };

  const createBuild = () => {
    if (!intent || !architecture || !answers.terrain || !answers.priority || !answers.budget) return;
    onCreate({
      id: `generated-${Date.now()}`,
      displayName: architecture.name,
      originalPrompt: prompt.trim(),
      additionalNotes: additionalNotes.trim(),
      sources,
      intent,
      clarifications: answers as ClarificationAnswers,
      architecture,
      createdAtLabel: 'Now',
    });
  };

  const currentStep = phase === 'input' ? 1 : phase === 'analyzing' ? 2 : phase === 'review' ? 3 : 4;
  const groupedArtifacts = architecture
    ? Object.entries(architecture.artifacts.slice(1).reduce<Record<string, typeof architecture.artifacts>>((groups, artifact) => {
        groups[artifact.category] = [...(groups[artifact.category] ?? []), artifact];
        return groups;
      }, {}))
    : [];

  return (
    <div className="scratch-overlay overlay-enter">
      <section className="scratch-shell modal-enter">
        <header className="scratch-header">
          <div><span className="scratch-logo"><Plus size={17} /></span><div><div className="eyebrow">START FROM SCRATCH</div><h1>Create the first engineering state</h1></div></div>
          <div className="scratch-header-actions"><span><Info size={12} /> Prototype analysis</span><button aria-label="Close new build" onClick={onClose}><X size={17} /></button></div>
        </header>

        <div className="scratch-progress" aria-label={`Step ${currentStep} of 4`}>
          {['Describe', 'Analyze', 'Clarify', 'Create Rev A'].map((label, index) => <div className={currentStep > index + 1 ? 'done' : currentStep === index + 1 ? 'active' : ''} key={label}><i>{currentStep > index + 1 ? <Check size={10} /> : index + 1}</i><span>{label}</span></div>)}
        </div>

        <div className="scratch-body">
          {phase === 'input' && (
            <div className="scratch-input-phase phase-enter">
              <div className="scratch-intro"><span>TEXT · IMAGE · VIDEO</span><h2>What are you trying to build?</h2><p>Describe the result in your own words. Add references only if they help explain shape, motion, components, or context.</p></div>
              <textarea className="scratch-primary-input" autoFocus value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="I want to build a compact inspection rover that can carry 20 lb, run for 4 hours, and fit through narrow industrial spaces." />
              <div className="scratch-examples">{EXAMPLE_PROMPTS.map((example) => <button key={example} onClick={() => setPrompt(example)}>{example}<ArrowRight size={12} /></button>)}</div>

              <div className="scratch-section-title"><div><span>OPTIONAL REFERENCES</span><b>Add context</b></div><small>Files stay in this browser</small></div>
              <div className="scratch-media-grid">
                <div className="scratch-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, 'image')}>
                  <FileImage size={20} /><b>Image references</b><span>Sketches, products, components, or diagrams</span>
                  <div><button onClick={() => imageInput.current?.click()}><Upload size={12} /> Choose images</button><button onClick={() => void loadDemoImage()}><Sparkles size={12} /> Demo rover image</button></div>
                  <input ref={imageInput} hidden type="file" accept="image/*" multiple onChange={(event) => void addFiles(Array.from(event.target.files ?? []), 'image')} />
                </div>
                <div className="scratch-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, 'video')}>
                  <Film size={20} /><b>Video reference</b><span>Motion, assembly, operation, or physical problems</span>
                  <div><button onClick={() => videoInput.current?.click()}><Upload size={12} /> {sources.some((source) => source.kind === 'video') ? 'Replace video' : 'Choose video'}</button></div>
                  <input ref={videoInput} hidden type="file" accept="video/*" onChange={(event) => void addFiles(Array.from(event.target.files ?? []), 'video')} />
                </div>
              </div>

              {sources.length > 0 && <div className="scratch-source-previews">{sources.map((source) => <article key={source.id}>{source.kind === 'image' ? <img src={source.url} alt={`Local reference ${source.name}`} /> : <video src={source.url} controls preload="metadata" />}<button aria-label={`Remove ${source.name}`} onClick={() => removeSource(source.id)}><X size={12} /></button><div><b>{source.name}</b><span>{formatBytes(source.sizeBytes)} · {source.kind === 'video' ? formatDuration(source.durationSeconds) : 'Image'}</span></div></article>)}</div>}

              <label className="scratch-notes"><span>Additional notes</span><textarea value={additionalNotes} onChange={(event) => setAdditionalNotes(event.target.value)} placeholder="I want it to behave like the rover in this video, but smaller." /></label>
              <div className="scratch-input-formula"><span>Text</span><i>+</i><span>Images</span><i>+</i><span>Videos</span><ArrowRight size={14} /><b>Structured build intent</b></div>
              {error && <div className="backend-error">{error}</div>}
              <footer className="scratch-footer"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={() => void runAnalysis()}><Sparkles size={14} /> Analyze Build Intent</button></footer>
            </div>
          )}

          {phase === 'analyzing' && (
            <div className="scratch-analysis phase-enter">
              <span className="analysis-orbit"><Sparkles size={25} /></span>
              <div className="eyebrow">SIMULATED FOR DEMO</div>
              <h2>Preparing the first product state</h2>
              <p>This deterministic prototype is demonstrating the future analysis sequence. No multimodal or engineering AI is connected.</p>
              <div>{ANALYSIS_STAGES.map((stage, index) => <span className={index < analysisIndex ? 'done' : index === analysisIndex ? 'active' : ''} key={stage}>{index < analysisIndex ? <Check size={12} /> : index === analysisIndex ? <LoaderCircle size={12} /> : <i />}{stage}{index === analysisIndex && <small>…</small>}</span>)}</div>
            </div>
          )}

          {phase === 'review' && intent && (
            <div className="scratch-review phase-enter">
              <div className="scratch-review-head"><div><div className="eyebrow">PROTOTYPE INTENT EXTRACTION</div><h2>{intent.buildGoal}</h2><p>{intent.goalSummary}</p></div><span>Simulated for demo</span></div>
              <div className="scratch-review-grid">
                <section><div className="scratch-section-title"><div><span>BUILD GOAL</span><b>Extracted requirements</b></div></div><div className="requirement-list">{intent.requirements.map((requirement) => <div key={requirement.key}><span>{requirement.label}</span><b>{requirement.value}</b><small>{requirement.source.replace('-', ' ')}</small></div>)}</div></section>
                <section><div className="scratch-section-title"><div><span>OPEN QUESTIONS</span><b>Missing decisions</b></div></div><div className="missing-list">{intent.missingDecisions.map((decision) => <span key={decision}><Plus size={10} />{decision}</span>)}</div>{intent.mediaObservations.length > 0 && <div className="media-observation"><Info size={13} /><span><b>Reference media retained</b>{intent.mediaObservations.map((observation) => <small key={observation.sourceId}>{observation.summary}</small>)}</span></div>}</section>
              </div>

              <div className="clarification-heading"><span>ONLY THE DECISIONS THAT CHANGE THE DESIGN</span><h3>Clarify the important uncertainty</h3></div>
              <div className="clarification-grid">{QUESTIONS.map((question) => <section key={question.key}><b>{question.title}</b><div>{question.choices.map((choice) => <button className={answers[question.key] === choice ? 'active' : ''} onClick={() => setAnswers((current) => ({ ...current, [question.key]: choice }))} key={choice}>{choice}{answers[question.key] === choice && <Check size={11} />}</button>)}</div></section>)}</div>
              <div className="human-forma-note"><span><b>You</b> clarify goals and priorities.</span><ArrowRight size={13} /><span><b>Forma Labs</b> organizes components and dependencies.</span></div>
              <footer className="scratch-footer"><button className="secondary" onClick={() => setPhase('input')}><ArrowLeft size={13} /> Back</button><button className="primary" disabled={!answers.terrain || !answers.priority || !answers.budget} onClick={() => void generateArchitecture()}>Generate Product Architecture <ArrowRight size={13} /></button></footer>
            </div>
          )}

          {phase === 'architecture' && intent && architecture && (
            <div className="scratch-architecture phase-enter">
              <div className="scratch-review-head"><div><div className="eyebrow">PROPOSED SYSTEM · REV A</div><h2>{architecture.name}</h2><p>Concept architecture from the extracted intent and your three clarification choices.</p></div><span>Prototype architecture</span></div>
              <div className="architecture-canvas">
                <div className="architecture-root"><span>PRODUCT</span><b>{architecture.artifacts[0]?.label}</b><small>{architecture.artifacts[0]?.meta}</small></div>
                <div className="architecture-groups">{groupedArtifacts.map(([category, artifacts]) => <section key={category}><header><i style={{ background: CATEGORY_META[category as keyof typeof CATEGORY_META].color }} /><span>{CATEGORY_META[category as keyof typeof CATEGORY_META].label}</span></header><div>{artifacts?.map((artifact) => <article key={artifact.id}><b>{artifact.label}</b><small>{artifact.meta}</small></article>)}</div></section>)}</div>
              </div>
              <div className="architecture-summary-grid">
                <section><div className="eyebrow">DESIGN ASSUMPTIONS</div>{architecture.assumptions.map((assumption) => <span key={assumption}><Check size={11} />{assumption}</span>)}</section>
                <section><div className="eyebrow">PROTOTYPE COMPLETENESS CHECKS</div>{architecture.prototypeChecks.map((check) => <span key={check}><Check size={11} />{check}</span>)}</section>
              </div>
              <div className="prototype-warning"><Info size={14} /><div><b>No engineering inference or CAD generation</b><span>{architecture.openCad.note} Part assignments, calculations, and engineering validation remain future work.</span></div></div>
              <footer className="scratch-footer"><button className="secondary" onClick={() => setPhase('review')}><ArrowLeft size={13} /> Revise answers</button><button className="primary create-build" onClick={createBuild}><Plus size={14} /> Create Build · Rev A</button></footer>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
