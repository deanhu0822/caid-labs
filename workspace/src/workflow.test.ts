import {describe,it,expect} from 'vitest';
import {emptyWorkflow,validateWorkflow,reviewProblem,reviseWorkflow} from './workflow';
import {createBrief,validateBrief,validateDraft,exportMarkdown} from './domain';
const complete=()=>({...emptyWorkflow(),target:'Enclosure',baseline:'B',proposed:'Change fastener',unchanged:'Envelope',owner:'Alex',reviewer:'Sam'});
describe('review context',()=>{
 it('loads older records without inventing project context',()=>expect(validateBrief(createBrief('Old request',[])).workflow).toBeUndefined());
 it('preserves target, parts, and connections in drafts',()=>{const workflow={...complete(),items:[{id:'a',name:'Cover',revision:'B',description:'Outer shell'},{id:'b',name:'Base',revision:'A',description:'Mount'}],links:[{id:'l',from:'a',to:'b',relation:'mounts to'}]};expect(validateDraft({request:'Change',sources:[],workflow}).workflow).toEqual(workflow);});
 it('rejects orphaned connections',()=>expect(()=>validateWorkflow({...complete(),links:[{id:'x',from:'missing',to:'also missing',relation:'powers'}]})).toThrow('connection'));
 it('requires distinct reviewers and resolution',()=>{expect(reviewProblem({...complete(),reviewer:' alex '})).toContain('different');expect(reviewProblem({...complete(),comments:[{id:'c',text:'Check units',resolved:false}]})).toContain('Resolve');});
 it('invalidates reviewed status when context changes',()=>expect(reviseWorkflow({...complete(),status:'Reviewed'},{proposed:'New change'}).status).toBe('Draft'));
 it('requires evidence at the storage validation boundary',()=>expect(()=>validateBrief({...createBrief('Change',[]),workflow:{...complete(),status:'Reviewed'}})).toThrow('evidence'));
 it('exports all coordination and source-location context',()=>{const brief={...createBrief('Change',[{id:'s',name:'test.csv',kind:'csv' as const,mime:'text/csv',size:5,text:'a,b',note:'Supports choice',appliesTo:'Enclosure',locator:'Row 2',status:'ready' as const}]),workflow:{...complete(),status:'Reviewed' as const}};expect(validateBrief(brief).workflow?.status).toBe('Reviewed');const report=exportMarkdown(brief);expect(report).toContain('Row 2');expect(report).toContain('Enclosure');expect(report).toContain('Sam');});
});
