import { ArrowRight, Check, RotateCcw } from 'lucide-react';
import { CHANGES, type Revision } from '../rover';
import { Dialog } from './Dialog';
export function SampleChange({revision,onApply,onClose}:{revision:Revision;onApply:(revision:Revision)=>void;onClose:()=>void}) {
 return <Dialog title="Review example change" onClose={onClose} wide>
 <div className="sample-content"><span className="overline">ILLUSTRATIVE ROVER EXAMPLE</span><h2>Upgrade Motor M2 to M4</h2><p>Raise payload from 8 to 10.4 kg while keeping the current chassis and camera.</p>
 <div className="table-scroll"><table className="change-table"><thead><tr><th>Part</th><th>Current · Rev C</th><th>Proposed · Rev D</th></tr></thead><tbody>{CHANGES.map(c=><tr key={c.id}><td><strong>{c.label}</strong><small>{c.reason}</small></td><td>{c.before}</td><td className="proposed-value">{c.after}</td></tr>)}</tbody></table></div>
 <h3>Example tradeoffs</h3><div className="tradeoffs"><span>Peak current<strong>+18%</strong></span><span>Mass<strong>+120 g</strong></span><span>BOM cost<strong>+$31.40</strong></span><span>Runtime<strong>−11%</strong></span></div>
 <p className="sample-note">These are fixed sample values from the recorded workflow, not results calculated from your files. Applying the example changes only this local demo.</p>
 </div><div className="dialog-footer"><button className="secondary-button" onClick={onClose}>Back to workspace</button><button className="primary-button" onClick={()=>onApply(revision==='C'?'D':'C')}>{revision==='C'?<>Apply example · Rev D<ArrowRight size={16}/></>:<><RotateCcw size={16}/>Restore Rev C</>}</button>{revision==='D'&&<span className="applied-note"><Check size={14}/> Rev D applied</span>}</div>
 </Dialog>;
}
