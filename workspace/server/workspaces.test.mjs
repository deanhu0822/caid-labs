import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { WorkspaceStore } from './workspaces.mjs';

test('workspace records are isolated by verified identity, roles, and workspace', () => {
  const db = new DatabaseSync(':memory:');
  const store = new WorkspaceStore(db);
  const a = store.create('alice','Hardware team');
  const b = store.create('mallory','Other team');
  store.addMember(a.id,'alice','bob','editor');
  store.addMember(a.id,'alice','viewer','viewer');
  assert.throws(()=>store.put(a.id,'alice','with-file',{sources:[{id:'file'}]},0),/Attachments are not supported/);
  assert.equal(store.put(a.id,'alice','review',{title:'Sensor'},0),1);
  assert.equal(store.list(a.id,'bob')[0].payload.title,'Sensor');
  assert.throws(()=>store.list(a.id,'mallory'),/denied/);
  assert.deepEqual(store.list(b.id,'mallory'),[]);
  assert.throws(()=>store.put(a.id,'viewer','review',{title:'overwrite'},1),/denied/);
  assert.throws(()=>store.addMember(a.id,'bob','mallory','editor'),/denied/);
  assert.equal(store.put(a.id,'bob','review',{title:'Revised'},1),2);
  assert.throws(()=>store.put(a.id,'alice','review',{title:'Stale'},1),/conflict/);
  assert.equal(store.list(a.id,'viewer')[0].payload.title,'Revised');
  assert.throws(()=>store.list(a.id,''),/Authentication required/);
  db.close();
});
