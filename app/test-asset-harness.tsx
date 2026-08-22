'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, ExternalLink, FileJson2, FileText, FlaskConical, LoaderCircle, Lock, Play, X } from 'lucide-react';
import {
  ENGINEERING_TEST_ASSETS,
  engineeringTestAssetUrl,
  type EngineeringTestAssetId,
  type EngineeringTestRunResult,
} from '@/lib/engineering-test-assets';

export function TestAssetHarness({ onClose }: { onClose: () => void }) {
  const [selectedId, setSelectedId] = useState<EngineeringTestAssetId>('asset-02-molded-housing');
  const [result, setResult] = useState<EngineeringTestRunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [parserMode, setParserMode] = useState<'checking' | 'mock' | 'local' | 'unavailable'>('checking');
  const asset = useMemo(() => ENGINEERING_TEST_ASSETS.find((item) => item.id === selectedId)!, [selectedId]);
  const displayedStatus = result?.statusLabel ?? (parserMode === 'local' ? 'Local' : parserMode === 'mock' ? 'Prototype' : parserMode === 'unavailable' ? 'Unavailable' : 'Checking…');
  const displayedStatusClass = result?.status ?? (parserMode === 'local' ? 'local' : parserMode === 'unavailable' ? 'unavailable' : 'prototype');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/inference/status', { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<{ services: Array<{ capability: string; mode: 'mock' | 'local' | 'unavailable' }> }> : Promise.reject(new Error('Inference status unavailable')))
      .then((status) => setParserMode(status.services.find((service) => service.capability === 'document-parse')?.mode ?? 'unavailable'))
      .catch((statusError: Error) => { if (statusError.name !== 'AbortError') setParserMode('unavailable'); });
    return () => controller.abort();
  }, []);

  const run = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const response = await fetch('/api/test-assets/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: asset.id }),
      });
      const payload = await response.json() as EngineeringTestRunResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'The test pipeline could not run.');
      setResult(payload);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'The test pipeline could not run.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop test-assets-backdrop overlay-enter" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="test-assets-modal modal-enter" role="dialog" aria-modal="true" aria-label="Engineering test assets">
        <header className="test-assets-header">
          <div><div className="eyebrow">DEVELOPMENT · DOCUMENT PIPELINE</div><h2>Engineering test assets</h2><p>Select one corpus input, inspect its source, then run it without changing the rover graph.</p></div>
          <button aria-label="Close test assets" onClick={onClose}><X size={17} /></button>
        </header>

        <div className="test-assets-layout">
          <nav className="test-asset-list" aria-label="Test asset selection">
            {ENGINEERING_TEST_ASSETS.map((item, index) => (
              <button key={item.id} className={item.id === selectedId ? 'active' : ''} onClick={() => { setSelectedId(item.id); setResult(null); setError(''); }}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div><b>{item.label}</b><small>{item.categoryLabel} · {item.pages} page{item.pages === 1 ? '' : 's'}</small></div>
                <ChevronRight size={13} />
              </button>
            ))}
            <div className="corpus-safety"><Lock size={14} /><span><b>Test inputs only</b>No asset is automatically imported into rover-alpha.</span></div>
          </nav>

          <main className="test-asset-workspace">
            <section className="test-asset-overview">
              <div className="test-asset-facts">
                <div><span>Test Asset</span><b>{asset.sourceFile}</b></div>
                <div><span>Detected modality</span><b>Document</b></div>
                <div><span>Pipeline</span><b>{asset.pipeline}</b></div>
                <div><span>Status</span><b className={displayedStatusClass}>{displayedStatus}</b></div>
              </div>
              <div className="test-asset-purpose"><FlaskConical size={16} /><p><b>{asset.categoryLabel}</b><span>{asset.testFocus}</span></p></div>
            </section>

            <section className="test-source-preview">
              <header><div><FileText size={14} /><span><b>Source preview</b><small>{asset.pages} PDF page{asset.pages === 1 ? '' : 's'} · preserved corpus copy</small></span></div><a href={engineeringTestAssetUrl(asset.sourceFile)} target="_blank" rel="noreferrer">Open source <ExternalLink size={12} /></a></header>
              <iframe title={asset.sourceFile} src={`${engineeringTestAssetUrl(asset.sourceFile)}#view=FitH`} />
            </section>

            <section className="test-run-panel">
              <div className="test-run-action">
                <div><span className="eyebrow">PROTOTYPE PIPELINE</span><h3>Extract structured engineering data</h3><p>The current fallback loads the matching golden fixture and explicitly reports that no inference ran.</p></div>
                <button onClick={() => void run()} disabled={loading}>{loading ? <LoaderCircle className="spin" size={14} /> : <Play size={14} />}{loading ? 'Running…' : 'Run selected asset'}</button>
              </div>
              {error && <div className="test-run-error"><AlertTriangle size={14} />{error}</div>}
              {result && (
                <div className="test-result">
                  <div className="test-result-summary">
                    <span className={`test-status ${result.status}`}><i />{result.statusLabel}</span>
                    <p>{result.summary}</p>
                    <span>{result.inferencePerformed ? 'Model inference performed' : 'No model inference performed'}</span>
                  </div>
                  <div className={`test-validation ${result.validation.valid ? 'valid' : 'invalid'}`}>
                    {result.validation.valid ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                    <span><b>{result.validation.valid ? 'Fixture contract valid' : 'Fixture contract failed'}</b>{result.validation.counts.parts} parts · {result.validation.counts.dimensions} dimensions · {result.validation.counts.risks} risks · {result.validation.counts.tasks} tasks</span>
                  </div>
                  {result.validation.issues.length > 0 && <ul>{result.validation.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
                  <div className="test-json-head"><div><FileJson2 size={14} /><span><b>Structured engineering JSON</b><small>{result.resultKind === 'golden-fixture' ? 'Teammate-provided expected output' : 'Parser output'}</small></span></div><a href={engineeringTestAssetUrl(asset.fixtureFile)} target="_blank" rel="noreferrer">Open fixture <ExternalLink size={11} /></a></div>
                  <pre>{JSON.stringify(result.structured, null, 2)}</pre>
                  <div className="test-provenance"><span>Source provenance</span><code>{result.provenance.repositoryPath}</code><code>sha256:{result.provenance.sourceSha256}</code></div>
                  <div className="test-commit-boundary"><Lock size={15} /><div><b>Shared Product state unchanged</b><span>{result.commitBlocker}</span></div><button disabled>Commit to Product</button></div>
                </div>
              )}
            </section>
          </main>
        </div>
      </section>
    </div>
  );
}
