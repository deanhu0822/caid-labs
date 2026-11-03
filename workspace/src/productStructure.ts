import type {Source} from './domain';
import type {Item, Link} from './workflow';

const TYPES = /\b(sensor|controller|display|regulator|enclosure|battery|motor|fan|pump|filter|connector|processor|heatsink|valve|actuator|board|antenna|camera|resistor)s?\b/gi;
/** A description map, never an inferred electrical netlist or physical assembly. */
export function productStructure(request:string, sources:Source[]):{items:Item[];links:Link[]} {
 const title=request.split(/[:.!?\n]/)[0].trim().slice(0,70)||'Product objective';
 const root:Item={id:'product',name:title,revision:'',description:'Product named in the objective; confirm scope.',origin:'description'};
 const items:Item[]=[root];
 const found=new Set<string>();
 for(const match of request.matchAll(TYPES)) {
  const type=match[1].toLowerCase();
  const before=request.slice(Math.max(0,match.index-45),match.index);
  if(/\b(?:no|without|excluding|remove)\s+(?:(?:a|an|any)\s+)?$/i.test(before))continue;

  const prefix=request.slice(Math.max(0,match.index-45),match.index).match(/([A-Z][A-Z0-9-]*\d[A-Z0-9-]*|OLED|LCD|USB|vented)\s+$/i)?.[1];
  if(found.has(type)){
   const existing=items.find(i=>i.id===`component-${type}`)!;
   if(!prefix||items.some(i=>i.name.toLowerCase()===`${prefix} ${type}`.toLowerCase()))continue;
   if(existing.name.toLowerCase()===type){existing.name=`${prefix} ${type}`;continue;}
  }
  const id=found.has(type)?`component-${type}-${items.length}`:`component-${type}`;
  found.add(type);
  const name=prefix?`${prefix} ${type}`:type[0].toUpperCase()+type.slice(1);
  const sourceIds=sources.filter(s=>s.status!=='error'&&new RegExp(`\\b${type}\\b`,'i').test(s.text)).map(s=>s.id);
  items.push({id,name,revision:'',description:`Mentioned in your description. Reference matches are not proof of installation or connectivity.`,origin:'description',sourceIds});
 }
 const links=items.slice(1).map(i=>({id:`contains-${i.id}`,from:root.id,to:i.id,relation:'mentioned component',basis:'inferred' as const}));
 return {items,links};
}
