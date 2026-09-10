/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS loader exercises the TypeScript reducer without changing the app runtime. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
// Exercise the production reducer with its actual checked-in Product records.
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8').replace(/(['"])@\//g, `$1${root}/`);
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
};
const { engineeringReducer, initialEngineeringState, j12ChangeProposal, cameraMountGeometryProposal } = require('../lib/engineering-state.ts');
const proposed = () => ({ ...initialEngineeringState, proposal: j12ChangeProposal(initialEngineeringState) });
test('applies an eligible candidate once', () => {
  const state = proposed();
  const accepted = engineeringReducer(state, { type: 'ACCEPT_PROPOSAL' });
  assert.equal(accepted.currentRevision, 'Rev D');
  assert.equal(accepted.proposal.status, 'accepted');
  assert.equal(engineeringReducer(accepted, { type: 'ACCEPT_PROPOSAL' }), accepted);
});
test('rejects stale baseline even when candidate is validated', () => {
  const state = { ...proposed(), currentRevision: 'Rev D' };
  assert.equal(engineeringReducer(state, { type: 'ACCEPT_PROPOSAL' }), state);
});
test('rejects a blocking validation result', () => {
  const state = proposed();
  state.proposal = { ...state.proposal, validation: [{ domain: 'Electrical', status: 'reject', message: 'Overcurrent' }] };
  assert.equal(engineeringReducer(state, { type: 'ACCEPT_PROPOSAL' }), state);
});
test('cannot bypass required CAD realization with generic approval', () => {
  const state = { ...initialEngineeringState, proposal: cameraMountGeometryProposal(initialEngineeringState, 105) };
  assert.equal(engineeringReducer(state, { type: 'ACCEPT_PROPOSAL' }), state);
});
