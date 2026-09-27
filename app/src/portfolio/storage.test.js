import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAllocationModel } from '../allocation/engine.js';
import { WORKSPACE_KEY, readWorkspace, writeWorkspace, validateSnapshot, validateDraft } from './storage.js';
const model = createAllocationModel({ profiles: [{ isin: 'A', nom: 'Nom transformé', nom_court: 'Actions USA', pays: { US: 100 }, secteurs: { Tech: 100 } }], catalog: [{ isin: 'A', nom: 'Amundi Official Fund UCITS ETF Acc' }, { isin: 'B', nom: 'Amundi Second Fund UCITS ETF Dist' }], prices: {}, sizes: {}, geographicZone: (country) => country });
const fallback = { weights: { A: 100 }, selectedIsins: ['A'], period: 36 };
const memory = () => { const data = new Map(); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; };
const draft = { step: 1, source: 'free', base: { A: 100 }, settings: { intent: { zones: { US: 100 }, sectors: { Tech: 100 } }, conviction: 65, equity: 80, maxFunds: 4, locks: { A: 30 }, minSize: 100e6, maxFee: '0.35', distribution: 'capitalisation', hedging: 'exclude', excluded: ['B'] }, selectedVariant: 0, manual: null, targetKind: 'sectors' };

test('current portfolio round-trips with zero-weight positions, locks, curves, Max and wizard configuration', () => {
  const storage = memory();
  const snapshot = validateSnapshot({ weights: { A: 80, B: 0 }, selectedIsins: ['B', 'A'], lockedIsins: ['A'], visibleEtfIsins: ['B'], period: 'max', geoView: 'zones', editorView: 'basket', filters: { query: 'Amundi', sort: 'fee-asc', minSize: 100e6, fullHistory: true }, wizardDraft: draft }, model);
  assert.equal(writeWorkspace(storage, snapshot, [{ id: 'basket-1', name: 'Europe', snapshot }], 'basket-1'), true);
  const restored = readWorkspace(storage, model, fallback);
  assert.deepEqual(restored.current, snapshot);
  assert.deepEqual(restored.baskets[0].snapshot, snapshot);
  assert.equal(restored.activeId, 'basket-1');
  assert.equal(restored.current.weights.B, 0);
  assert.equal(restored.current.wizardDraft.settings.conviction, 65);
});
test('an intentionally empty basket remains empty on reload', () => {
  const storage = memory();
  writeWorkspace(storage, { weights: {}, selectedIsins: [] }, [], '');
  assert.deepEqual(readWorkspace(storage, model, fallback).current.weights, {});
});
test('corrupt storage and failed writes are surfaced without crashing', () => {
  const storage = memory(); storage.setItem(WORKSPACE_KEY, '{invalid');
  const result = readWorkspace(storage, model, fallback);
  assert.ok(result.error);
  assert.deepEqual(result.current.weights, fallback.weights);
  assert.equal(writeWorkspace({ setItem() { throw new Error('quota'); } }, result.current, [], ''), false);
  assert.ok(readWorkspace({ getItem() { throw new Error('disabled'); } }, model, fallback).error);
});
test('over-allocation, negative weights and invalid drafts are rejected', () => {
  assert.equal(validateSnapshot({ weights: { A: 70, B: 40 } }, model), null);
  assert.equal(validateSnapshot({ weights: { A: -1 } }, model), null);
  assert.equal(validateSnapshot({ weights: { A: Infinity } }, model), null);
  assert.equal(validateDraft({ ...draft, settings: { ...draft.settings, conviction: 500 } }, model), null);
  assert.equal(validateDraft({ ...draft, settings: { ...draft.settings, intent: { zones: { US: 30 }, sectors: { Tech: 100 } } } }, model), null);
  assert.equal(validateDraft({ ...draft, manual: { A: 100 } }, model).manual, null);
});
test('obsolete ids, dangling locks and duplicate library ids are discarded', () => {
  const storage = memory();
  const snapshot = { weights: { A: 80, obsolete: 20 }, selectedIsins: ['A', 'obsolete', 'A'], lockedIsins: ['B', 'obsolete'], visibleEtfIsins: ['B'] };
  storage.setItem(WORKSPACE_KEY, JSON.stringify({ version: 1, current: snapshot, baskets: [{ id: 'one', name: 'One', snapshot }, { id: 'one', name: 'Duplicate', snapshot }], activeId: 'missing' }));
  const result = readWorkspace(storage, model, fallback);
  assert.deepEqual(result.current.weights, { A: 80 });
  assert.deepEqual(result.current.lockedIsins, []);
  assert.equal(result.baskets.length, 1);
  assert.equal(result.activeId, '');
});
test('official catalog names always take precedence over explanatory profiles', () => {
  assert.equal(model.funds.A.name, 'Amundi Official Fund UCITS ETF Acc');
  assert.equal(model.funds.A.nom, 'Amundi Official Fund UCITS ETF Acc');
  assert.equal(model.funds.B.name, 'Amundi Second Fund UCITS ETF Dist');
});

test('zone locks survive saving while old drafts and unknown zones stay compatible', () => {
  const next = validateDraft({ ...draft, settings: { ...draft.settings, zoneLocks: ['US', 'obsolete', 'US'] } }, model);
  assert.deepEqual(next.settings.zoneLocks, ['US']);
  assert.deepEqual(validateDraft(draft, model).settings.zoneLocks, []);
  const storage = memory();
  writeWorkspace(storage, { ...fallback, wizardDraft: next }, [], '');
  assert.deepEqual(readWorkspace(storage, model, fallback).current.wizardDraft.settings.zoneLocks, ['US']);
});
