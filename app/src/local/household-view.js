export const OWNERS = [
  ['commun', 'Commun'], ['conjoint_1', 'Propre conjoint 1'],
  ['conjoint_2', 'Propre conjoint 2'], ['non_precise', 'Non précisée'],
  ['enfants', 'Enfants / hors foyer'], ['previsionnel', 'Prévisionnel'],
];

const toCents = (value) => Math.round(Number(value || 0) * 100);
const fromCents = (value) => value / 100;

export function summarizeAssets(items) {
  const current = items.filter((item) => item.status !== 'previsionnel' && item.owner !== 'enfants');
  const categories = new Map();
  for (const item of current) {
    if (item.kind === 'actif') categories.set(item.category, (categories.get(item.category) || 0) + toCents(item.value_eur));
  }
  const assets = [...categories].map(([name, cents]) => ({ name, value: fromCents(cents) }))
    .filter((entry) => entry.value > 0).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'fr'));
  const owners = OWNERS.map(([id, label]) => {
    const rows = items.filter((item) => id === 'previsionnel'
      ? item.status === 'previsionnel' : item.status !== 'previsionnel' && item.owner === id);
    const grouped = new Map();
    let debts = 0;
    for (const item of rows) {
      if (item.kind === 'passif') debts += toCents(item.value_eur);
      else grouped.set(item.category, (grouped.get(item.category) || 0) + toCents(item.value_eur));
    }
    const total = [...grouped.values()].reduce((sum, value) => sum + value, 0);
    return { id, label, assets: fromCents(total), debts: fromCents(debts), net: fromCents(total - debts),
      categories: [...grouped].map(([name, cents]) => ({ name, value: fromCents(cents) })).filter((entry) => entry.value > 0) };
  });
  return { assets, owners };
}
