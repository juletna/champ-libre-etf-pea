import { emptyMigration, money, planPurchases } from '../migration/engine.js';

const integerCents = (value) => Math.round((value + Number.EPSILON) * 100);
const fromCents = (value) => value / 100;

export function feeForOrder(isin, amount, date, rule) {
  if (rule.eligibleIsins.includes(isin) && date >= rule.start && date <= rule.end && amount >= rule.minimum && amount <= rule.maximum) return 0;
  return money(rule.fixed + amount * rule.percent / 100);
}

export function planLocalInvestment({ positions, cash, deposit, target, quotes, rule, today, maxQuoteAgeDays = 7 }) {
  if (!target) return { error: 'Activez une cible dans Mon cap.' };
  if (![cash, deposit].every((number) => Number.isFinite(number) && number >= 0)) return { error: 'Espèces ou versement invalide.' };
  if (deposit > 0 && !Number.isFinite(deposit)) return { error: 'Versement invalide.' };
  const holdings = Object.fromEntries(positions.map((position) => [position.isin, position.value_eur]));
  const basis = planPurchases({ ...emptyMigration(), holdings, cash, deposit,
    target: { name: target.name, weights: target.weights }, mode: 'amount' });
  if (!basis) return { error: 'Cible absente.' };
  const rows = [];
  const missing = [];
  for (const candidate of basis.rows) {
    if (candidate.theoretical <= 0) { rows.push({ ...candidate, quantity: 0, buy: 0, fee: 0 }); continue; }
    const quote = quotes[candidate.id];
    const quoteDay = quote?.date;
    const age = quoteDay ? Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${quoteDay}T00:00:00Z`)) / 86400000) : NaN;
    if (!quote || !Number.isFinite(quote.price) || quote.price <= 0 || Math.abs(quote.price * 100 - integerCents(quote.price)) > 1e-6 || !Number.isInteger(age) || age < 0 || age > maxQuoteAgeDays) {
      missing.push(candidate.id); rows.push({ ...candidate, quantity: 0, buy: 0, fee: 0 }); continue;
    }
    const price = integerCents(quote.price);
    const allocation = integerCents(candidate.theoretical);
    const upper = Math.floor(allocation / price);
    const feasible = (quantity) => {
      const buy = fromCents(quantity * price);
      const fee = feeForOrder(candidate.id, buy, today, rule);
      return integerCents(buy + fee) <= allocation;
    };
    let lo = 0; let hi = upper;
    while (lo < hi) {
      const middle = Math.ceil((lo + hi) / 2);
      if (feasible(middle)) lo = middle; else hi = middle - 1;
    }
    // A promotion can make the cost fall at its minimum threshold.
    const threshold = Math.ceil(integerCents(rule.minimum) / price);
    let quantity = lo;
    if (threshold <= upper && feasible(threshold)) {
      let left = threshold; let right = upper;
      while (left < right) {
        const middle = Math.ceil((left + right) / 2);
        if (feasible(middle)) left = middle; else right = middle - 1;
      }
      quantity = Math.max(quantity, left);
    }
    const buy = fromCents(quantity * price);
    rows.push({ ...candidate, quantity, buy, fee: quantity ? feeForOrder(candidate.id, buy, today, rule) : 0, quoteDay });
  }
  const fees = money(rows.reduce((sum, row) => sum + row.fee, 0));
  const spent = money(rows.reduce((sum, row) => sum + row.buy + row.fee, 0));
  const remainingCash = money(basis.budget - spent);
  const afterTotal = money(basis.currentTotal + deposit - fees);
  const before = basis.currentTotal;
  for (const row of rows) {
    row.after = money(row.before + row.buy);
    row.beforeWeight = before ? row.before / before * 100 : 0;
    row.afterWeight = afterTotal ? row.after / afterTotal * 100 : 0;
  }
  const cashAfterWeight = afterTotal ? remainingCash / afterTotal * 100 : 0;
  const gap = (rows.reduce((sum, row) => sum + Math.abs(row.afterWeight - row.target), 0)
    + Math.abs(cashAfterWeight - basis.cashWeight)) / 2;
  return { ...basis, rows, fees, remainingCash, afterTotal, cashAfterWeight, gap, missingPrices: missing, spent,
    incompletePositions: positions.filter((position) => position.quantity == null).map((position) => position.isin) };
}
