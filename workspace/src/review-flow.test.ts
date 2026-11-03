import {describe,it,expect} from 'vitest';
import {createBrief,replaceBriefSource,validateBrief,exportMarkdown,type Source} from './domain';
import {emptyWorkflow} from './workflow';
const source:Source={id:'pdf',name:'data.pdf',kind:'pdf',mime:'application/pdf',size:4,text:'Reference',note:'Old note',status:'ready',appliesTo:'Resistor',locator:'Page 9'};
describe('review evidence updates',()=>{
 it('updates copied notes and invalidates status',()=>{const b=createBrief('Current limit',[source]);b.workflow={...emptyWorkflow(),status:'In review'};const next=replaceBriefSource(b,{...source,note:'Corrected note'});expect(next.workflow?.status).toBe('Draft');expect(next.observations[0].text).toBe('Note: Corrected note');});
 it('preserves an independently edited reviewer observation',()=>{const b=createBrief('Current limit',[source]);b.observations[0].text='Reviewer calculation';expect(replaceBriefSource(b,{...source,note:'Correction'}).observations[0].text).toBe('Reviewer calculation');});
 it('adds a note for evidence attached after saving',()=>{const b=createBrief('Current limit',[{...source,note:''}]);expect(replaceBriefSource(b,source).observations[0].sourceId).toBe('pdf');});
 it('round-trips and exports current versus proposed context',()=>{const b=createBrief('Current limit',[source]);b.workflow={...emptyWorkflow(),current:'30 kΩ',proposed:'32 kΩ'};expect(validateBrief(b).workflow?.current).toBe('30 kΩ');expect(exportMarkdown(b)).toContain('Current design: 30 kΩ');});
});
