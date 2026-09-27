import test from 'node:test';
import assert from 'node:assert/strict';
import { feeForOrder, planLocalInvestment } from './investment.js';

const rule = { broker: 'Test', eligibleIsins: ['B'], start: '2026-09-01', end: '2026-12-31', minimum: 500, maximum: 100000, percent: 0.35, fixed: 0 };
const target = { name: 'Test', weights: { B: 100 } };
const base = { positions: [], cash: 0, deposit: 1000, target, quotes: { B: { price: 100, date: '2026-09-27' } }, rule, today: '2026-09-27' };

test('promotional threshold and validity are checked per order', () => {
  assert.equal(feeForOrder('B', 500, '2026-09-27', rule), 0);
  assert.equal(feeForOrder('B', 400, '2026-09-27', rule), 1.4);
  assert.equal(feeForOrder('B', 500, '2027-01-01', rule), 1.75);
  assert.equal(feeForOrder('X', 500, '2026-09-27', rule), 1.75);
});

test('whole shares, fees, stale quotes and actual assets stay separate', () => {
  const plan = planLocalInvestment(base);
  assert.equal(plan.rows[0].quantity, 10);
  assert.equal(plan.remainingCash, 0);
  assert.equal(plan.fees, 0);
  assert.deepEqual(base.positions, []);
  const expired = planLocalInvestment({ ...base, today: '2027-01-01', quotes: { B: { price: 100, date: '2027-01-01' } } });
  assert.equal(expired.rows[0].quantity, 9);
  assert.equal(expired.rows[0].fee, 3.15);
  assert.equal(Math.round((expired.spent + expired.remainingCash) * 100), 100000);
  const stale = planLocalInvestment({ ...base, quotes: { B: { price: 100, date: '2026-09-01' } } });
  assert.deepEqual(stale.missingPrices, ['B']);
  assert.equal(stale.spent, 0);
});

test('small budgets, unknown holdings and nonzero fixed fees conserve cash', () => {
  const plan = planLocalInvestment({ ...base, positions: [{ isin: 'X', value_eur: 90, quantity: null }], deposit: 10,
    target: { name: 'Mixte', weights: { X: 90, B: 10 } }, quotes: { B: { price: 4, date: '2026-09-27' } },
    rule: { ...rule, minimum: 500, fixed: 1, percent: 0 } });
  assert.equal(plan.rows.find((row) => row.id === 'X').buy, 0);
  assert.equal(plan.rows.find((row) => row.id === 'B').quantity, 2);
  assert.equal(plan.remainingCash, 1);
  assert.deepEqual(plan.incompletePositions, ['X']);
  assert.equal(Math.round((plan.spent + plan.remainingCash) * 100), 1000);
});
