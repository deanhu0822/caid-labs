import {createBrief,type Draft,type Source,type Brief} from './domain';
import {emptyWorkflow} from './workflow';
import {productStructure} from './productStructure';

const STOP=new Set('the and with from this that while into keep should would could please prepare proposal change design current nominal product using want need improve reduce lower without'.split(' '));
const FAMILIES=[['heat','thermal','temperature','warm','heating','bias'],['air','airflow','vent','ventilation'],['power','supply','voltage'],['noise','quiet','acoustic'],['humidity','moisture','condensation'],['mount','mounting','fastener','screw'],['weight','mass','lightweight']];
const ACTION=/\b(should|must|recommend\w*|avoid\w*|mitigat\w*|shield\w*|decoupl\w*|minimiz\w*|keep|reduce\w*|prevent\w*|place\w*)\b/i;
const EXCLUDE=/ignore (?:all |previous )?instructions|system prompt|assistant|api.?key|submit|copyright|warranty|liability|bibliography|contents|\.{4}/i;
export type Passage={source:Source;quote:string;page?:number;score:number;action:boolean};
export function relevantPassages(request:string,sources:Source[]):Passage[] {
 const terms=[...new Set((request.toLowerCase().match(/[a-z0-9-]+/g)??[]).filter(t=>t.length>2&&!STOP.has(t)))];
 for(const family of FAMILIES)if(family.some(t=>terms.includes(t)))terms.push(...family);
 const unique=[...new Set(terms)];
 const result:Passage[]=[];
 for(const source of sources.filter(s=>s.status!=='error')) {
  const pages=source.pageTexts??[source.text];
  pages.forEach((raw,index)=>{
   // Normalize layout whitespace, preserving decimal points and units in the evidence.
   const text=raw.replace(/\s+/g,' ').trim();
   for(const quote of text.split(/(?<=[.!?])\s+(?=[A-Z•])|\s*•\s*/)) {
    if(quote.length<45||quote.length>650||EXCLUDE.test(quote))continue;
    // Do not recommend interface-specific guidance that conflicts with the objective.
    if(/\banalog\b/i.test(quote)&&/\b(I2C|SPI|digital)\b/i.test(request)&&!/\banalog\b/i.test(request))continue;
    const matched=unique.filter(t=>new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\w*\\b`,'i').test(quote));
    if(matched.length<2)continue;
    const caption=/(?:^|[.!?]\s)Figure\s+\d+|\b[a-c]\)/i.test(quote);
    const action=ACTION.test(quote)&&!caption;
    result.push({source,quote,page:source.pageTexts?index+1:undefined,score:matched.length+(action?4:0)-(caption?5:0)-(/trade-off/i.test(quote)?4:0)-(source.kind==='image'?1:0),action});
   }
  });
 }
 const seen=new Set<string>();
 return result.sort((a,b)=>b.score-a.score).filter(p=>{const key=p.quote.toLowerCase().replace(/\W/g,'');if(seen.has(key))return false;seen.add(key);return true;});
}
export function evidenceExcerpt(request:string,source:Source):string {return relevantPassages(request,[source])[0]?.quote??'';}
export function generateProposal(draft:Draft):Brief {
 if(!draft.request.trim())throw new Error('Describe your objective before drafting a proposal.');
 const brief=createBrief(draft.request,draft.sources);
 const original=draft.workflow??emptyWorkflow();
 const goal=draft.request.trim();
 const structure=productStructure(goal,draft.sources);
 const target=original.target||structure.items[0].name;
 brief.title=`${target} — proposal`;
 const keep=goal.match(/\b(?:while keeping|while preserving|without changing|keep|preserve)\s+([\s\S]+?)(?:[.!?](?:\s|$)|$)/i)?.[1]?.trim();
 const passages=relevantPassages(goal,draft.sources);
 const options=passages.filter(p=>p.action).slice(0,3);
 const others=passages.filter(p=>!options.includes(p)).filter((p,i,a)=>a.findIndex(x=>x.source.id===p.source.id)===i).slice(0,2);
 brief.generation='Local evidence draft · source guidance and description-derived product map. Candidate options, not validated engineering analysis. Images contribute OCR text only.';
 brief.observations=[...brief.observations,...options.map((p,i)=>({id:crypto.randomUUID(),sourceId:p.source.id,page:p.page,quote:p.quote,text:`Option ${i+1} — assess this source guidance for ${target}. Confirm applicability before changing hardware.`})),...others.map(p=>({id:crypto.randomUUID(),sourceId:p.source.id,page:p.page,quote:p.quote,text:p.source.kind==='image'?'Image text reference — verify OCR against the original.':'Supporting reference — verify applicability to this product.'}))];
 for(const source of draft.sources)if(!passages.some(p=>p.source.id===source.id))brief.observations.push({id:crypto.randomUUID(),sourceId:source.id,text:`Evidence gap: ${source.name} ${source.text.trim()?'has no sufficiently relevant passage.':'has no readable text.'} No design conclusion inferred.`});
 const proposed=options.length?options.map((p,i)=>`Option ${i+1} — evaluate for this objective:\n“${p.quote}”\n[${p.source.name}${p.page?`, p. ${p.page}`:''}${p.source.kind==='image'?', OCR — verify':''}]`).join('\n\n'):'No supported design option found in the readable attachments. Add a design guide, drawing note or test report addressing the objective; the product map can still organize the described components.';
 brief.workflow={...original,target,baseline:original.baseline||'',current:original.current||'Product description is captured in the graph. Actual layout, installed values and baseline revision still need confirmation.',proposed:original.proposed||proposed,unchanged:original.unchanged||(keep?`From your objective: ${keep}`:''),items:original.items.length?original.items:structure.items,links:original.items.length?original.links:structure.links,status:'Draft',comments:[...original.comments,{id:crypto.randomUUID(),text:'Confirm the baseline, source applicability and product-map relationships; uploaded references do not prove the installed design.',resolved:false},...(!options.length?[{id:crypto.randomUUID(),text:'No supported option found. Add relevant evidence before review.',resolved:false}]:[])]};
 brief.nextSteps=options.map((p,i)=>({id:crypto.randomUUID(),text:`Option ${i+1}: compare a prototype implementing this guidance against the baseline; record acceptance limits and measured results. Reference: ${p.source.name}${p.page?` p. ${p.page}`:''}.`,done:false}));
 brief.nextSteps.push({id:crypto.randomUUID(),text:'Confirm preserved constraints and cross-component impacts with the reviewer before selecting an option.',done:false});
 return brief;
}
