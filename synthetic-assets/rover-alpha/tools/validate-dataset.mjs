import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const errors = [];
const checks = [];
const pass = (name, detail) => checks.push({ name, detail });
const fail = (message) => errors.push(message);
const walk = async (dir) => { const out=[]; for (const entry of await fs.readdir(dir,{withFileTypes:true})) { const p=path.join(dir,entry.name); if(entry.isDirectory()) out.push(...await walk(p)); else out.push(p); } return out; };
const parseCsv = (text) => { const rows=[]; let row=[], field='', quoted=false; for(let i=0;i<text.length;i++){const c=text[i]; if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"')quoted=false;else field+=c;}else if(c==='"')quoted=true;else if(c===','){row.push(field);field='';}else if(c==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}else field+=c;} if(field||row.length){row.push(field);rows.push(row);} return rows.filter(r=>r.some(v=>v!=='')); };
const files = await walk(root);
const relative = (file) => path.relative(root,file).replaceAll('\\','/');

for (const file of files.filter(f=>f.endsWith('.json'))) { try { JSON.parse(await fs.readFile(file,'utf8')); } catch(e) { fail('Invalid JSON '+relative(file)+': '+e.message); } }
pass('json','Parsed '+files.filter(f=>f.endsWith('.json')).length+' JSON files');

const product = JSON.parse(await fs.readFile(path.join(root,'product.json'),'utf8'));
const ids = new Set(product.artifacts.map(a=>a.id));
if(ids.size!==product.artifacts.length) fail('Duplicate artifact IDs');
if(product.artifacts.length!==34) fail('Expected 34 graph artifacts');
if(product.relationships.length!==40) fail('Expected 40 graph relationships');
for(const edge of product.relationships){if(!ids.has(edge.source)||!ids.has(edge.target)) fail('Broken graph edge '+edge.id);}
pass('graph',product.artifacts.length+' artifacts and '+product.relationships.length+' relationships');

for(const artifact of product.artifacts) for(const source of artifact.source_files) { try { await fs.access(path.join(root,source)); } catch { fail('Missing source file for '+artifact.id+': '+source); } }
pass('source-files','All product.json source files exist');

const validateRefs = (value,file) => { if(Array.isArray(value)) { for(const item of value) validateRefs(item,file); return; } if(!value||typeof value!=='object') return; for(const [key,v] of Object.entries(value)){ if(key==='artifact_refs'&&Array.isArray(v)) for(const id of v) if(!ids.has(id)) fail('Unknown artifact ref '+id+' in '+file); else void 0; validateRefs(v,file); } };
for(const file of files.filter(f=>f.endsWith('.json'))) validateRefs(JSON.parse(await fs.readFile(file,'utf8')),relative(file));
pass('artifact-refs','All explicit artifact_refs resolve');

const bomPath=path.join(root,'bom','bom-rev-c.csv'); const bomRows=parseCsv(await fs.readFile(bomPath,'utf8'));
const header=bomRows[0]; if(header.length!==13) fail('BOM must have 13 columns');
for(const [index,row] of bomRows.slice(1).entries()) { if(row.length!==header.length) fail('BOM row '+(index+2)+' has '+row.length+' columns'); }
if(bomRows.length!==31) fail('BOM must contain 30 data rows');
const byLine=new Map(bomRows.slice(1).map(r=>[Number(r[0]),r]));
for(const [line,pn] of [[4,'BAT-24-12'],[9,'CM-4K-R2'],[18,'MTR-24-220'],[22,'DRV-8A'],[27,'43025-0400']]) if(byLine.get(line)?.[1]!==pn) fail('BOM line '+line+' expected '+pn);
pass('csv','BOM CSV has 30 valid rows and required graph line mappings');

for(const file of ['bom/bom-rev-c.csv','electrical/j12-connector.json','electrical/system-netlist.json','firmware/motor_ctrl.c','manufacturing/cable-routing.md','suppliers/supplier-catalog.json','tests/power-test-procedure.md','revisions/change-log.md']) { const text=await fs.readFile(path.join(root,file),'utf8'); if(!text.includes('43025-0400')) fail(file+' does not cross-reference J12 43025-0400'); }
pass('cross-domain','J12 43025-0400 appears in all required domains');

const labels=JSON.parse(await fs.readFile(path.join(root,'scanner','labels.json'),'utf8'));
for(const image of labels.images){try{await fs.access(path.join(root,'scanner',image.file));}catch{fail('Missing scanner image '+image.file);} for(const object of image.objects){const [x,y,w,h]=object.bbox_xywh;if(x<0||y<0||w<=0||h<=0||x+w>image.width||y+h>image.height)fail('Out-of-bounds box in '+image.file);if(object.artifact_id&&!ids.has(object.artifact_id))fail('Unknown scanner artifact '+object.artifact_id);}}
pass('scanner',labels.images.length+' labeled synthetic scanner assets');

const scenarioData=JSON.parse(await fs.readFile(path.join(root,'scenarios.json'),'utf8')); if(scenarioData.scenarios.length<5) fail('Need at least five scenarios');
for(const file of ['builder_tasks.json','product_questions.json','supply_tasks.json']) { const data=JSON.parse(await fs.readFile(path.join(root,'evaluation',file),'utf8')); if(!data.tasks.length) fail('No evaluation tasks in '+file); for(const task of data.tasks) if(!task.expected_answer||!task.evidence_files?.length) fail('Incomplete expected answer in '+file+' '+task.id); }
pass('evaluation',scenarioData.scenarios.length+' scenarios and complete agent ground truth');

const secretPatterns=[/sk-[A-Za-z0-9_-]{20,}/g,/AKIA[0-9A-Z]{16}/g,/mongodb(?:\+srv)?:\/\/[^\s:@]+:[^\s@]+@/gi,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g];
for(const file of files.filter(f=>!f.endsWith('.png')&&!f.endsWith('.xlsx'))){const text=await fs.readFile(file,'utf8');for(const pattern of secretPatterns)if(pattern.test(text))fail('Potential secret in '+relative(file));}
pass('secrets','No common API keys, credentialed MongoDB URIs, or private keys detected');

if(errors.length){console.error(JSON.stringify({ok:false,errors,checks},null,2));process.exit(1);} console.log(JSON.stringify({ok:true,checks,file_count:files.length},null,2));
