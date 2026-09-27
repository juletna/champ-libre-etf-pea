import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAllocationModel, rebalanceTarget, validateSavedModels, CASH_ISIN } from './engine.js';
import { geographicZone } from './geography.js';
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const model = createAllocationModel({ profiles: read('../data/mvp-profiles.json').etfs, catalog: read('../etf_pea_fortuneo_amundi.json').etf, prices: read('../data/mvp-prices.json').par_isin, sizes: read('../data/mvp-fund-sizes.json').par_isin, geographicZone });
const base = { LU1681043599: 60, FR0011871128: 25, LU1829219390: 15 };
const defaults = { intent: model.intent(base), conviction: 100, equity: 100, maxFunds: 4, locks: {}, minSize: 0, maxFee: '', distribution: '', hedging: 'any', excluded: [] };
const sum = (values) => values.reduce((a, b) => a + b, 0);

test('all variants conserve the budget, obey locks, filters and line limits', () => {
  for (const variant of ['faithful', 'cost', 'simple']) {
    const settings = { ...defaults, equity: 80, locks: { LU1681043599: 20 }, maxFee: 0.3, distribution: 'capitalisation', minSize: 100e6 };
    const result = model.solve(settings, variant);
    assert.deepEqual(result.errors, []);
    assert.ok(Math.abs(sum(Object.values(result.weights)) - 100) < 1e-8);
    assert.equal(result.weights.LU1681043599, 20);
    assert.equal(result.weights[CASH_ISIN], 20);
    assert.ok(result.count <= settings.maxFunds);
    for (const [id, w] of Object.entries(result.weights)) {
      assert.ok(w >= 0 && w <= 100);
      if (id !== 'LU1681043599') {
        assert.ok(model.funds[id].fee <= settings.maxFee);
        assert.ok(model.funds[id].size >= settings.minSize);
        assert.equal(model.funds[id].distribution, 'capitalisation');
      }
    }
  }
});
test('conflicting constraints fail with actionable explanations', () => {
  for (const patch of [
    { equity: 60, locks: { LU1681043599: 80 } },
    { equity: 80, maxFee: 0.15 },
    { equity: 80, maxFunds: 1 },
    { minSize: 1e15 },
    { locks: { FR0014017NX3: 20 } },
    { equity: 80, locks: { [CASH_ISIN]: 10 } },
  ]) assert.ok(model.solve({ ...defaults, ...patch }).errors.length);
});
test('fully locked and fully defensive allocations remain valid', () => {
  const locked = model.solve({ ...defaults, locks: base });
  assert.deepEqual(locked.weights, base);
  const defensive = model.solve({ ...defaults, equity: 0 });
  assert.deepEqual(defensive.weights, { [CASH_ISIN]: 100 });
  assert.equal(sum(Object.values(defensive.exposure.sectors)), 0);
  assert.equal(defensive.exposure.unknown, 0);
});
test('conviction interpolates targets, and defensive sleeve scales equities', () => {
  const low = model.targets({ ...defaults, conviction: 0, equity: 50 });
  assert.ok(Math.abs(low.zones['États-Unis'] - model.funds.LU1681043599.zones['États-Unis'] / 2) < 1e-8);
  const high = model.targets(defaults);
  assert.ok(Math.abs(sum(Object.values(high.zones)) - 100) < 1e-8);
  assert.ok(Math.abs(sum(Object.values(low.sectors)) - 50) < 1e-8);
});
test('the exposure search responds to a geographic conviction', () => {
  const settings = { ...defaults, intent: { ...defaults.intent, zones: rebalanceTarget(defaults.intent.zones, 'Japon', 80) } };
  const result = model.solve(settings);
  assert.deepEqual(result.errors, []);
  assert.ok(result.exposure.zones.Japon > 65);
});
test('target sliders redistribute all other dimensions and handle a zero remainder', () => {
  const next = rebalanceTarget({ US: 70, Europe: 20, Japon: 10 }, 'US', 40);
  assert.deepEqual(next, { US: 40, Europe: 40, Japon: 20 });
  assert.deepEqual(rebalanceTarget({ US: 100, Europe: 0, Japon: 0 }, 'US', 40), { US: 40, Europe: 30, Japon: 30 });
});
test('flows reconcile each position including previously unallocated money', () => {
  const before = { LU1681043599: 30, FR0011871128: 20 };
  const after = { LU1681043599: 20, FR0013412038: 70, [CASH_ISIN]: 10 };
  const net = {};
  for (const flow of model.transfers(before, after)) {
    net[flow.from] = (net[flow.from] || 0) - flow.amount;
    net[flow.to] = (net[flow.to] || 0) + flow.amount;
  }
  assert.equal(net.cash_unallocated, -50);
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) assert.ok(Math.abs((net[id] || 0) - ((after[id] || 0) - (before[id] || 0))) < 1e-8);
});
test('risk comparison uses common dates and preserves cash at zero return', () => {
  const risk = model.compareRisk([{ LU1681043599: 100 }, { LU1681043599: 50 }]);
  assert.equal(risk.available, true);
  assert.ok(Math.abs(risk.metrics[0].volatility / 2 - risk.metrics[1].volatility) < 1e-8);
  assert.ok(risk.metrics[0].drawdown <= risk.metrics[1].drawdown);
  const short = model.compareRisk([{ FR0014017NX3: 100 }, base]);
  assert.equal(short.available, false);
});
test('counterweights actually lower the named concentration without modifying a lock', () => {
  const weights = { FR0011871110: 50, FR0013412038: 50 };
  const choices = model.counterweights(weights, 'FR0011871110', defaults);
  assert.ok(choices.length > 0);
  for (const choice of choices) { assert.ok(choice.delta < 0); assert.equal(sum(Object.values(choice.weights)), 100); }
  assert.deepEqual(model.counterweights(weights, 'FR0011871110', { ...defaults, locks: { FR0011871110: 50 } }), []);
});
test('saved models reject corrupt or foreign data', () => {
  assert.deepEqual(validateSavedModels({ version: 2, models: [] }, model.funds), []);
  const good = { id: 'one', name: 'Mon modèle', weights: base };
  const bad = [{ ...good, weights: { foreign: 100 } }, { ...good, weights: { LU1681043599: -5 } }, { ...good, weights: { LU1681043599: 101 } }];
  assert.deepEqual(validateSavedModels({ version: 1, models: [good, ...bad] }, model.funds), [good]);
});

test('risk calculations stop at a hole and require twelve actual monthly returns', () => {
  const history = Array.from({ length: 25 }, (_, i) => ({ mois: `${2024 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`, cours_ajuste: 100 + i }));
  const shortModel = createAllocationModel({ profiles: [], catalog: [{ isin: 'a', nom: 'A' }, { isin: 'b', nom: 'B' }], sizes: {}, geographicZone, prices: { a: { historique: history }, b: { historique: history.filter((_, i) => i !== 20) } } });
  assert.equal(shortModel.compareRisk([{ a: 100 }, { b: 100 }]).available, false);
});

test('zero-weight locks survive and no unknown composition enters the automatic allocation', () => {
  const result = model.solve({ ...defaults, locks: { FR0014017NX3: 0 } });
  assert.equal(result.weights.FR0014017NX3, 0);
  for (const [id, w] of Object.entries(result.weights)) if (w > 0 && id !== CASH_ISIN) assert.equal(model.funds[id].known, true);
});

test('zone locks preserve targets, cap redistribution and handle all locked or last free zone', () => {
  const values = { US: 60, Europe: 30, Japan: 10 };
  assert.deepEqual(rebalanceTarget(values, 'Japan', 100, ['Europe']), { US: 0, Europe: 30, Japan: 70 });
  assert.deepEqual(rebalanceTarget(values, 'Europe', 0, ['Europe']), values);
  assert.deepEqual(rebalanceTarget(values, 'Japan', 50, ['US', 'Europe']), values);
  assert.deepEqual(rebalanceTarget(values, 'US', 0, Object.keys(values)), values);
  assert.deepEqual(rebalanceTarget({ US: 0, Europe: 100, Japan: 0 }, 'Japan', 50, ['US']), { US: 0, Europe: 50, Japan: 50 });
  const zeroFree = rebalanceTarget({ US: 100, Europe: 0, Japan: 0 }, 'US', 40, ['Europe']);
  assert.deepEqual(zeroFree, { US: 40, Europe: 0, Japan: 60 });
});
test('conviction preserves locked zone targets and redistributes the free remainder', () => {
  const zones = rebalanceTarget(Object.fromEntries(model.zoneNames.map((name) => [name, defaults.intent.zones[name] || 0])), 'Japon', 35);
  for (const conviction of [0, 50, 100]) {
    const target = model.targets({ ...defaults, conviction, equity: 80, intent: { ...defaults.intent, zones }, zoneLocks: ['Japon'] });
    assert.equal(target.zones.Japon, 28);
    assert.ok(Math.abs(sum(Object.values(target.zones)) - 80) < 1e-8);
    assert.ok(Math.abs(sum(Object.values(target.sectors)) - 80) < 1e-8);
  }
  const locked = model.targets({ ...defaults, conviction: 0, zoneLocks: model.zoneNames });
  for (const name of model.zoneNames) assert.equal(locked.zones[name], defaults.intent.zones[name] || 0);
});
test('total performance compounds monthly with the same dates for every allocation', () => {
  const history = [100, 110, 99].map((value, i) => ({ mois: `2025-0${i + 1}`, cours_ajuste: value }));
  const sample = createAllocationModel({ profiles: [], catalog: [], sizes: {}, geographicZone, prices: { a: { historique: history }, b: { historique: history.slice(1) } } });
  const full = sample.comparePerformance([{ a: 100, missing: 0 }, { a: 50 }, {}], 12);
  assert.equal(full.months, 2);
  assert.equal(full.limited, true);
  assert.ok(Math.abs(full.totals[0] + 1) < 1e-8);
  assert.ok(Math.abs(full.totals[1] + 0.25) < 1e-8);
  assert.equal(full.totals[2], 0);
  const common = sample.comparePerformance([{ a: 100 }, { b: 100 }], Infinity);
  assert.equal(common.start, '2025-02');
  assert.equal(common.end, '2025-03');
  assert.equal(common.months, 1);
  assert.deepEqual(common.totals, [-9.999999999999998, -9.999999999999998]);
  assert.equal(sample.comparePerformance([{ a: 100 }, { missing: 50 }]).available, false);
  assert.equal(sample.comparePerformance([{}, {}]).available, false);
});
test('performance honors requested windows and does not bridge missing months', () => {
  const history = Array.from({ length: 25 }, (_, i) => ({ mois: `${2024 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`, cours_ajuste: 100 + i }));
  const sample = createAllocationModel({ profiles: [], catalog: [], sizes: {}, geographicZone, prices: { a: { historique: history }, b: { historique: history.filter((_, i) => i !== 20) }, c: { historique: history.slice(0, 1) } } });
  assert.equal(sample.comparePerformance([{ a: 100 }], 12).months, 12);
  assert.equal(sample.comparePerformance([{ a: 100 }], Infinity).months, 24);
  assert.equal(sample.comparePerformance([{ a: 100 }, { b: 100 }], 12).months, 3);
  assert.equal(sample.comparePerformance([{ a: 100 }, { c: 100 }]).available, false);
});
