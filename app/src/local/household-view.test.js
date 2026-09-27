import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeAssets } from './household-view.js';

test('asset and ownership views keep debts and excluded items separate', () => {
  const item = (kind, category, value_eur, owner = 'commun', status = 'actuel') => ({ kind, category, value_eur, owner, status });
  const result = summarizeAssets([
    item('actif', 'Immobilier', 100000), item('actif', 'Liquidités', 5000, 'conjoint_1'),
    item('passif', 'Crédit', 40000), item('actif', 'Liquidités', 1000, 'enfants'),
    item('actif', 'Autre', 9000, 'commun', 'previsionnel'),
  ]);
  assert.deepEqual(result.assets, [{ name: 'Immobilier', value: 100000 }, { name: 'Liquidités', value: 5000 }]);
  assert.deepEqual(result.owners.map(({ id, net }) => [id, net]), [
    ['commun', 60000], ['conjoint_1', 5000], ['conjoint_2', 0],
    ['non_precise', 0], ['enfants', 1000], ['previsionnel', 9000],
  ]);
  assert.equal(result.owners[0].debts, 40000);
});
