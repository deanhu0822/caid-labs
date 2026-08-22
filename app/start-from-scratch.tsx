'use client';

/* eslint-disable @next/next/no-img-element -- Local object URLs cannot use the Next image optimizer. */

import { useEffect, useRef, useState, type DragEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, FileImage, FileText, Film, Info, LoaderCircle, Plus, Sparkles, Upload, X } from 'lucide-react';
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
type InputMode = 'text' | 'image' | 'video' | 'document' | 'mixed';

const EXAMPLE_PROMPTS = [
  'Build a warehouse inspection rover',
  'Design a portable air-quality monitor',
  'Make a small robotic camera platform',
  'Build a desktop pick-and-place machine',
];

const ANALYSIS_STAGES = [
  'Understanding objective',
  'Interpreting document sources',
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

const DOCUMENT_EXTENSIONS = /\.(pdf|docx?|xlsx?|csv|txt|md|pptx?)$/i;

function isDocumentFile(file: File) {
  return file.type === 'application/pdf'
    || file.type.startsWith('text/')
    || /officedocument|msword|ms-excel|spreadsheet|presentation/.test(file.type)
    || DOCUMENT_EXTENSIONS.test(file.name);
}

function documentTypeLabel(source: PrototypeInputSource) {
  const extension = source.name.split('.').pop()?.toUpperCase();
  return extension ? `${extension} document` : 'Engineering document';
}

export function StartFromScratch({ onClose, onCreate }: { onClose: () => void; onCreate: (build: PrototypeBuildDefinition) => void }) {
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const documentInput = useRef<HTMLInputElement>(null);
  const replaceDocumentInput = useRef<HTMLInputElement>(null);
  const sourceRef = useRef<PrototypeInputSource[]>([]);
  const [phase, setPhase] = useState<Phase>('input');
  const [inputMode, setInputMode] = useState<InputMode>('mixed');
  const [prompt, setPrompt] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [sources, setSources] = useState<PrototypeInputSource[]>([]);
  const [intent, setIntent] = useState<PrototypeIntent | null>(null);
  const [architecture, setArchitecture] = useState<PrototypeArchitecture | null>(null);
  const [analysisIndex, setAnalysisIndex] = useState(0);
  const [answers, setAnswers] = useState<Partial<ClarificationAnswers>>({});
  const [error, setError] = useState('');
  const [previewDocumentId, setPreviewDocumentId] = useState<string | null>(null);
  const [replaceDocumentId, setReplaceDocumentId] = useState<string | null>(null);

  useEffect(() => {
    sourceRef.current = sources;
  }, [sources]);

  useEffect(() => () => {
    sourceRef.current.forEach((source) => URL.revokeObjectURL(source.url));
  }, []);

  const addFiles = async (files: File[], kind: PrototypeSourceKind, replaceId?: string | null) => {
    const validFiles = files.filter((file) => kind === 'document' ? isDocumentFile(file) : file.type.startsWith(`${kind}/`));
    if (!validFiles.length) { setError(`Choose a valid ${kind} file.`); return; }
    const maxBytes = kind === 'image' ? 15 * 1024 * 1024 : kind === 'video' ? 120 * 1024 * 1024 : 25 * 1024 * 1024;
    if (validFiles.some((file) => file.size > maxBytes)) { setError(`${kind === 'image' ? 'Images' : kind === 'video' ? 'Videos' : 'Documents'} must be smaller than ${kind === 'image' ? '15' : kind === 'video' ? '120' : '25'} MB.`); return; }

    const selectedFiles = replaceId || kind === 'video' ? validFiles.slice(0, 1) : validFiles.slice(0, kind === 'document' ? 4 : 3);
    const nextSources: PrototypeInputSource[] = [];
    for (const [index, file] of selectedFiles.entries()) {
      const url = URL.createObjectURL(file);
      nextSources.push({
        id: `${kind}-${Date.now()}-${index}`,
        kind,
        name: file.name,
        mimeType: file.type || (kind === 'document' ? 'application/octet-stream' : `${kind}/unknown`),
        url,
        sizeBytes: file.size,
        durationSeconds: kind === 'video' ? await readVideoDuration(url) : undefined,
      });
    }

    setSources((current) => {
      if (replaceId) {
        const replaced = current.find((source) => source.id === replaceId);
        if (replaced) URL.revokeObjectURL(replaced.url);
        return current.map((source) => source.id === replaceId ? nextSources[0] : source);
      }
      if (kind === 'video') {
        current.filter((source) => source.kind === 'video').forEach((source) => URL.revokeObjectURL(source.url));
        return [...current.filter((source) => source.kind !== 'video'), ...nextSources];
      }
      const limit = kind === 'document' ? 4 : 3;
      const existingKind = current.filter((source) => source.kind === kind);
      const combinedKind = [...existingKind, ...nextSources].slice(0, limit);
      const discarded = [...existingKind, ...nextSources].slice(limit);
      discarded.forEach((source) => URL.revokeObjectURL(source.url));
      return [...current.filter((source) => source.kind !== kind), ...combinedKind];
    });
    setError('');
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, kind: PrototypeSourceKind) => {
    event.preventDefault();
    void addFiles(Array.from(event.dataTransfer.files), kind);
  };

  const removeSource = (id: string) => {
    if (previewDocumentId === id) setPreviewDocumentId(null);
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
    setAnalysisIndex(ANALYSIS_STAGES.length - 1);
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
  const previewDocument = sources.find((source) => source.id === previewDocumentId && source.kind === 'document') ?? null;
  const showImageInput = inputMode === 'image' || inputMode === 'mixed';
  const showVideoInput = inputMode === 'video' || inputMode === 'mixed';
  const showDocumentInput = inputMode === 'document' || inputMode === 'mixed';
  const sourceCounts = {
    image: sources.filter((source) => source.kind === 'image').length,
    video: sources.filter((source) => source.kind === 'video').length,
    document: sources.filter((source) => source.kind === 'document').length,
  };

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
              <div className="scratch-intro"><span>TEXT · IMAGE · VIDEO · DOCUMENT · MIXED</span><h2>What are you trying to build?</h2><p>Describe the result in your own words. Add references only if they help explain shape, motion, components, requirements, or context.</p></div>
              <div className="scratch-modality-tabs" aria-label="Input modality">{(['text', 'image', 'video', 'document', 'mixed'] as InputMode[]).map((item) => <button className={inputMode === item ? 'active' : ''} key={item} onClick={() => setInputMode(item)}>{item[0].toUpperCase() + item.slice(1)}{item !== 'text' && item !== 'mixed' && sourceCounts[item] > 0 && <span>{sourceCounts[item]}</span>}</button>)}</div>
              <textarea className="scratch-primary-input" autoFocus value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="I want to build a compact inspection rover that can carry 20 lb, run for 4 hours, and fit through narrow industrial spaces." />
              <div className="scratch-examples">{EXAMPLE_PROMPTS.map((example) => <button key={example} onClick={() => setPrompt(example)}>{example}<ArrowRight size={12} /></button>)}</div>

              {inputMode !== 'text' && <><div className="scratch-section-title"><div><span>OPTIONAL REFERENCES</span><b>{inputMode === 'document' ? 'Add engineering documents' : 'Add context'}</b></div><small>Files stay in this browser</small></div>
              <div className={`scratch-media-grid ${inputMode === 'mixed' ? 'mixed' : 'single'}`}>
                {showImageInput &&
                <div className="scratch-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, 'image')}>
                  <FileImage size={20} /><b>Image references</b><span>Sketches, products, components, or diagrams</span>
                  <div><button onClick={() => imageInput.current?.click()}><Upload size={12} /> Choose images</button><button onClick={() => void loadDemoImage()}><Sparkles size={12} /> Demo rover image</button></div>
                  <input ref={imageInput} hidden type="file" accept="image/*" multiple onChange={(event) => void addFiles(Array.from(event.target.files ?? []), 'image')} />
                </div>}
                {showVideoInput &&
                <div className="scratch-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, 'video')}>
                  <Film size={20} /><b>Video reference</b><span>Motion, assembly, operation, or physical problems</span>
                  <div><button onClick={() => videoInput.current?.click()}><Upload size={12} /> {sources.some((source) => source.kind === 'video') ? 'Replace video' : 'Choose video'}</button></div>
                  <input ref={videoInput} hidden type="file" accept="video/*" onChange={(event) => void addFiles(Array.from(event.target.files ?? []), 'video')} />
                </div>}
                {showDocumentInput &&
                <div className="scratch-dropzone document-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, 'document')}>
                  <FileText size={20} /><b>Engineering documents</b><span>PDFs, datasheets, BOMs, specifications, manuals, or reports</span>
                  <div><button onClick={() => documentInput.current?.click()}><Upload size={12} /> Choose documents</button></div>
                  <input ref={documentInput} hidden type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.ppt,.pptx,application/pdf,text/*" multiple onChange={(event) => void addFiles(Array.from(event.target.files ?? []), 'document')} />
                </div>}
              </div></>}

              {sources.length > 0 && <div className="scratch-source-previews">{sources.map((source) => <article className={source.kind === 'document' ? 'document-source' : ''} key={source.id}>{source.kind === 'image' ? <img src={source.url} alt={`Local reference ${source.name}`} /> : source.kind === 'video' ? <video src={source.url} controls preload="metadata" /> : <button className="document-preview-button" onClick={() => setPreviewDocumentId(source.id)}><FileText size={22} /><span>Preview</span></button>}<button className="remove-source" aria-label={`Remove ${source.name}`} onClick={() => removeSource(source.id)}><X size={12} /></button>{source.kind === 'document' && <button className="replace-document" onClick={() => { setReplaceDocumentId(source.id); replaceDocumentInput.current?.click(); }}>Replace</button>}<div><b>{source.name}</b><span>{formatBytes(source.sizeBytes)} · {source.kind === 'video' ? formatDuration(source.durationSeconds) : source.kind === 'image' ? 'Image' : documentTypeLabel(source)}</span></div></article>)}</div>}
              <input ref={replaceDocumentInput} hidden type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.ppt,.pptx,application/pdf,text/*" onChange={(event) => { void addFiles(Array.from(event.target.files ?? []), 'document', replaceDocumentId); event.currentTarget.value = ''; setReplaceDocumentId(null); }} />

              <label className="scratch-notes"><span>Additional notes</span><textarea value={additionalNotes} onChange={(event) => setAdditionalNotes(event.target.value)} placeholder="I want it to behave like the rover in this video, but smaller." /></label>
              <div className="scratch-input-formula"><span>Text</span><i>+</i><span>Images</span><i>+</i><span>Video</span><i>+</i><span>Documents</span><ArrowRight size={14} /><b>Structured build intent</b></div>
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
              {intent.documentObservations.length > 0 && <section className="scratch-document-results"><div className="scratch-section-title"><div><span>DOCUMENT SOURCES</span><b>Prototype document interpretation</b></div><small>Future parser: Nemotron Parse 2.0</small></div>{intent.documentObservations.map((document) => <article key={document.sourceId}><header><FileText size={14} /><span><b>{document.title}</b><small>{document.sourceName} · {document.mode} · no model inference</small></span></header>{document.properties.length > 0 ? <dl>{document.properties.map((property) => <div key={property.key}><dt>{property.label}</dt><dd>{property.value}<small>Source · {property.sourceName}</small></dd></div>)}</dl> : <p>The file is retained as a local source. No deterministic demo extraction is defined for this filename.</p>}</article>)}</section>}

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
      {previewDocument && <div className="scratch-document-preview" role="dialog" aria-modal="true" aria-label={`Preview ${previewDocument.name}`} onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewDocumentId(null); }}><section><header><div><FileText size={16} /><span><b>{previewDocument.name}</b><small>{formatBytes(previewDocument.sizeBytes)} · browser-local preview</small></span></div><button aria-label="Close document preview" onClick={() => setPreviewDocumentId(null)}><X size={15} /></button></header>{previewDocument.mimeType === 'application/pdf' ? <iframe title={previewDocument.name} src={previewDocument.url} /> : <div className="document-preview-unavailable"><FileText size={30} /><b>Preview is not available for this file type</b><span>{documentTypeLabel(previewDocument)} is retained locally and will remain attached to the structured build intent.</span></div>}</section></div>}
    </div>
  );
}
