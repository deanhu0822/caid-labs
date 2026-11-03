import { useState } from 'react';
import { Maximize2, Minus, Plus, Circle } from 'lucide-react';
import { CONNECTIONS, neighbors, type Part, type Revision } from '../rover';

export function ProductGraph({parts,selected,onSelect,revision}:{parts:Part[];selected:string;onSelect:(id:string)=>void;revision:Revision}) {
 const [zoom,setZoom]=useState(1);
 const connected=neighbors(selected);
 return <section className="graph-area" aria-label="Product graph">
  <div className="graph-heading"><div><span className="overline">PRODUCT GRAPH</span><h2>How it fits together</h2></div><span className="graph-count">9 parts · Rev {revision}</span></div>
  <div className="graph-scroll">
   <svg className="product-graph" viewBox="0 0 900 655" role="group" style={{width:`${zoom*100}%`,height:`${zoom*100}%`}} aria-label="Connected rover components">
    <defs><pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#1e303d"/></pattern></defs>
    <rect width="900" height="655" fill="url(#dots)"/>
    {CONNECTIONS.map(([from,to,relation])=>{
     const a=parts.find(p=>p.id===from)!; const b=parts.find(p=>p.id===to)!;
     const horizontal=a.y===b.y; const x1=horizontal?(a.x<b.x?a.x+190:a.x):a.x+95; const y1=horizontal?a.y+44:a.y+88;
     const x2=horizontal?(a.x<b.x?b.x:b.x+190):b.x+95; const y2=horizontal?b.y+44:b.y;
     const middle=(y1+y2)/2;
     return <path key={`${from}-${to}`} className={`graph-edge ${from===selected||to===selected?'connected':''}`} d={horizontal?`M ${x1} ${y1} L ${x2} ${y2}`:`M ${x1} ${y1} C ${x1} ${middle}, ${x2} ${middle}, ${x2} ${y2}`}><title>{a.label} {relation} {b.label}</title></path>;
    })}
    {parts.map(p=><foreignObject key={p.id} x={p.x} y={p.y} width="190" height="88"><button onClick={()=>onSelect(p.id)} className={`graph-node ${selected===p.id?'selected':''} ${connected.includes(p.id)?'neighbor':''}`} aria-pressed={selected===p.id} aria-label={`Inspect ${p.label}`}><span className="node-category"><i className={`category-dot category-${p.category.toLowerCase()}`}/>{p.category}</span><strong>{p.label}</strong><small>{p.code}</small></button></foreignObject>)}
   </svg>
  </div>
  <div className="graph-footer"><span><Circle size={8} fill="currentColor"/> Select a part to inspect its connections</span><div className="zoom-controls"><button className="icon-button" aria-label="Zoom out" disabled={zoom<=.8} onClick={()=>setZoom(z=>Math.max(.8,z-.2))}><Minus size={15}/></button><span>{Math.round(zoom*100)}%</span><button className="icon-button" aria-label="Zoom in" disabled={zoom>=1.8} onClick={()=>setZoom(z=>Math.min(1.8,z+.2))}><Plus size={15}/></button><button className="icon-button" aria-label="Fit graph" onClick={()=>setZoom(1)}><Maximize2 size={15}/></button></div></div>
 </section>;
}
