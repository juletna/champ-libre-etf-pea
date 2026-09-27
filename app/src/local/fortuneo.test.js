import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareFortuneo } from './fortuneo.js';

const sample = 'Libellé\tCours\t\tDev\tVar/Veille\tQté\tPRU\tValorisation\t+/- values\t+/- values (%)\tPoids\tISIN\nETF fictif A\t12,50\tV\tEUR\t0,10 %\t4\t12,00\t50,00\t2,00\t4,00 %\t40 %\tLU0000000001\nETF fictif B\t7,00\tV\tEUR\t0,20 %\t11\t6,50\t77,005\t5,50\t7,00 %\t60 %\tIE0000000001';

test('Fortuneo paste maps holdings and rounds valuation to cents', () => {
  assert.deepEqual(prepareFortuneo(sample), {
    count: 2,
    text: 'ISIN\tLibellé\tQuantité\tValorisation\nLU0000000001\tETF fictif A\t4\t50.00\nIE0000000001\tETF fictif B\t11\t77.01',
  });
});

test('Fortuneo paste rejects missing and duplicated holdings', () => {
  assert.throws(() => prepareFortuneo('other\tdata'), /en-têtes/);
  assert.throws(() => prepareFortuneo(`${sample}\n${sample.split('\n')[1]}`), /dupliqué/);
});
