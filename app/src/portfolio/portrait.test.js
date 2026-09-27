import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CASH_ISIN, WORLD_ISIN, createAllocationModel } from '../allocation/engine.js';
import { geographicZone } from '../allocation/geography.js';
import { comparisonText, defaultRole, exposureDistance, metric, portrait, recoveryLabel } from './portrait.js';
import { validateSnapshot, readWorkspace, writeWorkspace } from './storage.js';
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const model = createAllocationModel({ profiles: read('../data/mvp-profiles.json').etfs, catalog: read('../etf_pea_fortuneo_amundi.json').etf, prices: read('../data/mvp-prices.json').par_isin, sizes: {}, geographicZone });
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('World has zero distance from itself; changing cash does not change action diversity', () => {
  const full = portrait(model, { [WORLD_ISIN]: 100 });
  const half = portrait(model, { [WORLD_ISIN]: 50, [CASH_ISIN]: 25 });
  close(full.distance, 0);
  for (const key of ['geo', 'sector', 'distance']) close(full[key], half[key]);
  close(half.sleeves.cash, 25);
  close(half.sleeves.unallocated, 25);
  close(half.firstCountry[1] * 2, full.firstCountry[1]);
  assert.equal(Number(full.countryCoverage.toFixed(2)), 97.41);
  assert.equal(full.countries['Autres pays'], undefined);
});
test('overlapping ETF lines do not create diversification; zero-weight lines are ignored', () => {
  const make = (countries) => createAllocationModel({ profiles: ['a', 'b', WORLD_ISIN].map((isin) => ({ isin, pays: countries, secteurs: { Tech: 80, Health: 20 } })), catalog: ['a', 'b', WORLD_ISIN].map((isin) => ({ isin })), prices: {}, sizes: {}, geographicZone: (name) => name });
  const sample = make({ US: 100 });
  const a = portrait(sample, { a: 100 });
  const b = portrait(sample, { a: 40, b: 60, unknown: 0 });
  close(a.geo, 0); close(a.sector, 0); close(a.geo, b.geo); close(a.distance, b.distance);
  const incomplete = portrait(make({ US: 50, 'Autres pays': 50 }), { a: 100 });
  assert.equal(incomplete.geo, null);
});
test('unknown compositions disable structural conclusions; cash-only and empty portfolios stay explicit', () => {
  const unknown = portrait(model, { [WORLD_ISIN]: 90, FR0014017NX3: 10 });
  for (const key of ['geo', 'sector', 'distance']) assert.equal(unknown[key], null);
  assert.match(unknown.reason, /sans composition/);
  const empty = portrait(model, {});
  assert.equal(empty.conviction, null);
  assert.equal(empty.sleeves.unallocated, 100);
  const cash = portrait(model, { [CASH_ISIN]: 100 });
  assert.equal(cash.geo, null); assert.equal(cash.conviction, 0);
  assert.equal(metric(empty, null, 'resistance').position, null);
});
test('role defaults and overrides count portfolio weight, with validated persistence and legacy compatibility', () => {
  assert.equal(defaultRole(WORLD_ISIN), 'core');
  assert.equal(defaultRole('FR0013412020'), 'emerging');
  assert.equal(defaultRole('FR0011871078'), 'conviction');
  const weights = { [WORLD_ISIN]: 70, FR0013412020: 15, FR0011871078: 5, LU1834983477: 5, LU1834983550: 5 };
  const p = portrait(model, weights);
  close(p.conviction, 15);
  const overrides = { [WORLD_ISIN]: 'conviction', FR0011871078: 'core', bogus: 'core', LU1834983477: 'invalid', [CASH_ISIN]: 'conviction' };
  const snapshot = validateSnapshot({ weights, portraitRoles: overrides }, model);
  assert.deepEqual(snapshot.portraitRoles, { [WORLD_ISIN]: 'conviction', FR0011871078: 'core' });
  close(portrait(model, weights, snapshot.portraitRoles).conviction, 80);
  let stored;
  const storage = { setItem(_, value) { stored = value; }, getItem() { return stored; } };
  assert.equal(writeWorkspace(storage, snapshot, [{ id: 'p', name: 'Test', snapshot }], 'p'), true);
  const restored = readWorkspace(storage, model, { weights });
  assert.deepEqual(restored.current.portraitRoles, snapshot.portraitRoles);
  assert.deepEqual(restored.baskets[0].snapshot.portraitRoles, snapshot.portraitRoles);
  assert.deepEqual(validateSnapshot({ weights }, model).portraitRoles, {});
});
test('exposure distance is bounded, symmetric and zero for matching distributions', () => {
  close(exposureDistance({ A: 100 }, { B: 100 }), 100);
  close(exposureDistance({ A: 70, B: 30 }, { A: 20, B: 80 }), 50);
  close(exposureDistance({ A: 20, B: 80 }, { A: 70, B: 30 }), 50);
  close(exposureDistance({ A: 70, B: 30 }, { A: 70, B: 30 }), 0);
  for (const id of Object.keys(model.funds)) {
    const p = portrait(model, { [id]: 100 });
    for (const key of ['geo', 'sector', 'conviction', 'distance']) assert.ok(p[key] == null || (p[key] >= -1e-10 && p[key] <= 100 + 1e-10));
  }
});
function historyModel(values, second = values) {
  const rows = (values) => values.map((cours_ajuste, index) => ({ mois: `${2023 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`, cours_ajuste }));
  return createAllocationModel({ profiles: [], catalog: [], prices: { a: { historique: rows(values) }, b: { historique: rows(second) } }, sizes: {}, geographicZone });
}
test('risk uses requested common periods; recovery is measured from worst peak to return to that peak', () => {
  const sample = historyModel([100, 120, 60, 90, 120, ...Array(20).fill(130)]);
  const all = sample.compareRisk([{ a: 100 }], Infinity);
  close(all.metrics[0].drawdown, -50);
  assert.equal(all.metrics[0].recoveryMonths, 3);
  const recent = sample.compareRisk([{ a: 100 }], 12);
  assert.equal(recent.months, 12); close(recent.metrics[0].drawdown, 0);
  assert.equal(recoveryLabel(recent.metrics[0]), 'Aucun recul');
  const notRecovered = historyModel([100, 120, 60, ...Array(10).fill(90)]).compareRisk([{ a: 100 }], 36);
  assert.equal(notRecovered.metrics[0].recoveryMonths, null);
  assert.match(recoveryLabel(notRecovered.metrics[0]), /Non récupéré/);
  const common = sample.compareRisk([{ a: 100 }, { b: 50 }], 12);
  assert.equal(common.start, sample.comparePerformance([{ a: 100 }, { b: 50 }], 12).start);
  assert.equal(common.end, sample.comparePerformance([{ a: 100 }, { b: 50 }], 12).end);
  assert.equal(historyModel([100, 80, 100]).compareRisk([{ a: 100 }], 12).available, false);
});
test('comparison text preserves the direction of concentration and loss differences', () => {
  const a = { geo: 20, sector: 50, conviction: 10, distance: 0, countryCoverage: 100 };
  const b = { geo: 30, sector: 40, conviction: 15, distance: 20, countryCoverage: 100 };
  assert.match(comparisonText(a, b, null, null, 'geo'), /diminue de 10/);
  assert.match(comparisonText(a, b, null, null, 'sector'), /augmente de 10/);
  assert.match(comparisonText(a, b, { drawdown: -20, volatility: 12, recoveryMonths: 3 }, { drawdown: -25, volatility: 14, recoveryMonths: 6 }, 'resistance'), /plus marqué de 5/);
  assert.match(comparisonText(a, b, null, null, 'resistance'), /insuffisant/);
});
