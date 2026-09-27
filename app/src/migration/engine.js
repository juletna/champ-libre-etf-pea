export const money = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const sum = (values) => values.reduce((a, b) => a + b, 0);
export const emptyMigration = () => ({ holdings: {}, cash: 0, deposit: 0, target: null, mode: 'amount', quotes: {}, fee: 0, updatedAt: '' });

// Euclidean projection of target deficits onto the available cash simplex.
// Cash itself is one allocation, so a target below 100% keeps its cash reserve.
function distribute(deficits, budget) {
  if (budget <= 0) return deficits.map(() => 0);
  const sorted = [...deficits].sort((a, b) => b - a);
  let prefix = 0;
  let threshold = 0;
  for (let i = 0; i < sorted.length; i++) {
    prefix += sorted[i];
    const candidate = (prefix - budget) / (i + 1);
    if (sorted[i] > candidate) threshold = candidate;
  }
  const raw = deficits.map((d) => Math.max(0, d - threshold) * 100);
  const cents = raw.map((n) => Math.floor(n + 1e-7));
  const remainder = Math.round(budget * 100) - sum(cents);
  const order = raw.map((n, i) => ({ i, fraction: n - cents[i] })).sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  for (let i = 0; i < remainder; i++) cents[order[i % order.length].i]++;
  return cents.map((n) => n / 100);
}

export function minimumDeposit(holdings, cash, weights) {
  const excluded = Object.keys(holdings).filter((id) => holdings[id] > 0 && !(weights[id] > 0));
  if (excluded.length) return { amount: null, excluded };
  const current = sum(Object.values(holdings)) + cash;
  const required = Math.max(current, ...Object.entries(holdings).map(([id, value]) => value > 0 ? value / (weights[id] / 100) : 0));
  return { amount: Math.max(0, Math.ceil((required - current) * 100 - 1e-7) / 100), excluded: [] };
}

export function planPurchases(data) {
  if (!data.target) return null;
  const { holdings, cash, deposit, target, quotes, fee, mode } = data;
  const weights = target.weights;
  const ids = [...new Set([...Object.keys(weights), ...Object.keys(holdings)])];
  const currentTotal = money(sum(Object.values(holdings)) + cash);
  const total = money(currentTotal + deposit);
  const budget = money(cash + deposit);
  const cashWeight = Math.max(0, 100 - sum(Object.values(weights)));
  const deficits = ids.map((id) => total * (weights[id] || 0) / 100 - (holdings[id] || 0));
  const allocations = distribute([...deficits, total * cashWeight / 100], budget);
  const missingPrices = mode === 'shares' ? ids.filter((id, i) => allocations[i] > 0 && (!quotes[id]?.price || !quotes[id]?.date)) : [];
  const rows = ids.map((id, i) => {
    const theoretical = allocations[i];
    const price = quotes[id]?.price || 0;
    const quantity = mode === 'shares' && price > 0 ? Math.floor((Math.max(0, theoretical - fee) + 1e-8) / price) : null;
    const buy = mode === 'shares' ? money((quantity || 0) * price) : theoretical;
    return { id, before: holdings[id] || 0, target: weights[id] || 0, theoretical, quantity, buy, fee: mode === 'shares' && buy > 0 ? fee : 0 };
  });
  const fees = money(sum(rows.map((r) => r.fee)));
  const remainingCash = money(budget - sum(rows.map((r) => r.buy + r.fee)));
  const afterTotal = money(total - fees);
  for (const row of rows) {
    row.after = money(row.before + row.buy);
    row.beforeWeight = currentTotal > 0 ? row.before / currentTotal * 100 : 0;
    row.afterWeight = afterTotal > 0 ? row.after / afterTotal * 100 : 0;
  }
  const cashAfterWeight = afterTotal > 0 ? remainingCash / afterTotal * 100 : 0;
  const gap = sum(rows.map((r) => Math.abs(r.afterWeight - r.target))) / 2 + Math.abs(cashAfterWeight - cashWeight) / 2;
  return { rows, currentTotal, afterTotal, budget, remainingCash, fees, cashWeight, cashAfterWeight, gap,
    missingPrices, minimum: minimumDeposit(holdings, cash, weights) };
}
