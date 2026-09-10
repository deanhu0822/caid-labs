'use client';

import { useEffect, useRef, useState } from 'react';
import type { EngineeringProposal } from '@/lib/engineering-state';

export function ChangeEvidence({ proposal }: { proposal: EngineeringProposal }) {
  return <div className="change-evidence">
    <p>{proposal.summary}</p>
    <div className="review-tradeoff"><strong>Tradeoff to accept</strong><p>{proposal.tradeoff}</p></div>
    <div className="review-metrics">{proposal.metrics.map(metric => <div key={metric.label}><strong>{metric.value}</strong><span>{metric.label}</span></div>)}</div>
    <h3>Required changes</h3>
    <div className="review-table-scroll"><table><thead><tr><th>Artifact</th><th>Current</th><th>Proposed</th><th>Reason</th></tr></thead><tbody>{proposal.changed.map(change => <tr key={change.artifactId}><th scope="row">{change.artifactId}</th><td>{change.before}</td><td>{change.after}</td><td>{change.reason}</td></tr>)}</tbody></table></div>
    <h3>Checks and open work</h3>
    <p className="review-note">These are dataset checks, not physical test certification. Manufacturing release requires independent engineering verification.</p>
    <ul className="review-checks">{proposal.validation.map(check => <li key={check.domain}><strong>{check.domain} · {check.status === 'pass' ? 'Dataset check passed' : check.status === 'warn' ? 'Review required' : 'Blocked'}</strong><span>{check.message}</span></li>)}</ul>
    <h3>Supporting sources · {proposal.evidence.length}</h3>
    {proposal.evidence.length ? proposal.evidence.map(item => <details className="review-source" key={item.sourceFile}><summary>{item.title} — {item.sourceFile}</summary><p>{item.excerpt}</p></details>) : <p>No linked source evidence. Add supporting evidence before engineering release.</p>}
    <h3>Preserved artifacts</h3><p>{proposal.preservedArtifactIds.join(', ') || 'None specified'}</p>
  </div>;
}

export function ChangeReview({ proposal, currentRevision, onAccept, onClose }: { proposal: EngineeringProposal; currentRevision: string; onAccept: () => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const eligible = proposal.status === 'validated' && proposal.baseRevision === currentRevision && !proposal.openCad.required && proposal.validation.every(check => check.status !== 'reject');
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={dialog} className="change-review" onCancel={onClose} aria-labelledby="change-review-title">
    <header><div><span>CHANGE REVIEW · {proposal.baseRevision} → {proposal.targetRevision}</span><h2 id="change-review-title">{proposal.title}</h2></div><button onClick={onClose} aria-label="Close change review">Close</button></header>
    <div className="change-review-body"><p className="review-note">Sample workspace. Applying updates this browser session only; it does not save a team release or approver identity.</p><ChangeEvidence proposal={proposal} /></div>
    <footer><label><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} /> I reviewed the tradeoff and remaining verification work.</label>{!eligible && <p role="alert">This candidate cannot be applied: review its baseline revision, blocking checks, or required CAD work.</p>}<button onClick={onClose}>Keep reviewing</button><button disabled={!eligible || !acknowledged} onClick={() => { onAccept(); onClose(); }}>Apply {proposal.targetRevision} to sample session</button></footer>
  </dialog>;
}
