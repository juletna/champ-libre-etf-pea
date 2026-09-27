import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyMigration, minimumDeposit, planPurchases } from './engine.js';
const example = (patch = {}) => ({ ...emptyMigration(), holdings: { W: 90 }, deposit: 10, target: { name: 'Cible', weights: { W: 90, B: 5, R: 5 } }, ...patch });
const buy = (plan, id) => plan.rows.find((r) => r.id === id).buy;
test('90 euros of World plus 10 euros reaches 90/5/5 exactly', () => {
  const plan = planPurchases(example());
  assert.equal(buy(plan, 'W'), 0); assert.equal(buy(plan, 'B'), 5); assert.equal(buy(plan, 'R'), 5);
  assert.equal(plan.gap, 0); assert.equal(plan.remainingCash, 0); assert.equal(plan.afterTotal, 100); assert.equal(plan.minimum.amount, 10);
});
test('small deposits reduce the gap without selling; larger deposits also buy World', () => {
  const small = planPurchases(example({ deposit: 4 }));
  assert.equal(buy(small, 'B'), 2); assert.equal(buy(small, 'R'), 2); assert.equal(buy(small, 'W'), 0);
  const large = planPurchases(example({ deposit: 110 }));
  assert.equal(buy(large, 'W'), 90); assert.equal(buy(large, 'B'), 10); assert.equal(buy(large, 'R'), 10); assert.equal(large.gap, 0);
});
test('existing cash reduces the required deposit and unallocated targets keep cash', () => {
  assert.equal(minimumDeposit({ W: 90 }, 6, { W: 90, B: 5, R: 5 }).amount, 4);
  const plan = planPurchases(example({ holdings: {}, cash: 30, deposit: 70, target: { name: 'Reserve', weights: { W: 70 } } }));
  assert.equal(buy(plan, 'W'), 70); assert.equal(plan.remainingCash, 30); assert.equal(plan.gap, 0);
});
test('a held ETF at zero target is impossible to remove with deposits', () => {
  const plan = planPurchases(example({ target: { name: 'Banks', weights: { B: 100 } } }));
  assert.equal(plan.minimum.amount, null); assert.deepEqual(plan.minimum.excluded, ['W']); assert.equal(buy(plan, 'W'), 0); assert.equal(buy(plan, 'B'), 10);
});
test('whole shares need dated prices, stay in budget, and reserve fees and remainder', () => {
  assert.deepEqual(planPurchases(example({ mode: 'shares' })).missingPrices, ['B', 'R']);
  const plan = planPurchases(example({ mode: 'shares', fee: 0.5, quotes: { B: { price: 2, date: '2026-09-27' }, R: { price: 25, date: '2026-09-27' } } }));
  assert.equal(buy(plan, 'B'), 4); assert.equal(buy(plan, 'R'), 0); assert.equal(plan.rows.find((r) => r.id === 'B').quantity, 2);
  assert.equal(plan.fees, 0.5); assert.equal(plan.remainingCash, 5.5); assert.equal(plan.afterTotal, 99.5);
});
test('cents are conserved across many budgets and target configurations', () => {
  for (let n = 0; n < 500; n++) {
    const plan = planPurchases(example({ holdings: { W: n / 10, B: 1.25 }, cash: 0.13, deposit: n / 100, target: { name: 'Test', weights: { W: 33.3, B: 33.3, R: 33.4 } } }));
    assert.ok(plan.rows.every((r) => r.buy >= 0 && Number.isFinite(r.buy)));
    assert.equal(Math.round((plan.rows.reduce((s, r) => s + r.buy, 0) + plan.remainingCash) * 100), Math.round(plan.budget * 100)); assert.ok(plan.remainingCash >= 0);
  }
});
test('empty portfolio, zero budget and cash-only target are supported', () => {
  assert.equal(planPurchases(emptyMigration()), null);
  const empty = planPurchases(example({ holdings: {}, deposit: 0 }));
  assert.equal(empty.afterTotal, 0); assert.equal(empty.rows.every((r) => Number.isFinite(r.afterWeight) && r.buy === 0), true);
  assert.equal(planPurchases(example({ holdings: {}, target: { name: 'Cash', weights: {} } })).remainingCash, 10);
});
test('cent allocation matches an independent exhaustive search on small budgets', () => {
  for (const weights of [{ W: 50, B: 50 }, { W: 80, B: 10 }, { W: 0, B: 100 }]) {
    for (let cents = 0; cents <= 8; cents++) {
      const data = example({ holdings: { W: 0.04 }, deposit: cents / 100, target: { name: 'Small', weights } });
      const plan = planPurchases(data);
      const total = 4 + cents;
      const score = (w, b, cash) => (4 + w - total * weights.W / 100) ** 2 + (b - total * weights.B / 100) ** 2 + (cash - total * (100 - weights.W - weights.B) / 100) ** 2;
      let best = Infinity;
      for (let w = 0; w <= cents; w++) for (let b = 0; b <= cents - w; b++) best = Math.min(best, score(w, b, cents - w - b));
      const actual = score(Math.round(buy(plan, 'W') * 100), Math.round(buy(plan, 'B') * 100), Math.round(plan.remainingCash * 100));
      assert.ok(Math.abs(actual - best) < 1e-7);
    }
  }
});
