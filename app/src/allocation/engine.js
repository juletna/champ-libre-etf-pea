// Deterministic exposure fitting. Historical returns never select the winners.
export const CASH_ISIN = 'FR0013346681';
export const WORLD_ISIN = 'LU1681043599';
export const PRESETS = [
  { id: 'world', name: 'Monde simple', description: 'Une base mondiale, avec peu de lignes.', weights: { FR001400U5Q4: 100 } },
  { id: 'europe', name: 'Biais Europe', description: 'Une place plus importante pour les actions européennes.', weights: { FR001400U5Q4: 60, FR0013412038: 40 } },
  { id: 'emerging', name: 'Monde + émergents', description: 'Compléter le monde développé par les marchés émergents.', weights: { FR001400U5Q4: 80, FR0013412020: 20 } },
];
const sum = (values) => values.reduce((a, b) => a + b, 0);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const normalized = (values) => {
  const total = sum(Object.values(values));
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, total ? 100 * value / total : 0]));
};
export function rebalanceTarget(values, name, requested, locked = []) {
  if (locked.includes(name)) return { ...values };
  const available = Math.max(0, 100 - sum(Object.entries(values).filter(([key]) => locked.includes(key)).map(([, value]) => value)));
  const others = Object.keys(values).filter((key) => key !== name && !locked.includes(key));
  const next = { ...values, [name]: others.length ? clamp(Number(requested) || 0, 0, available) : available };
  const total = sum(others.map((key) => values[key]));
  others.forEach((key) => { next[key] = (available - next[name]) * (total ? values[key] / total : 1 / others.length); });
  return next;
}

export function createAllocationModel({ profiles, catalog, prices, sizes, geographicZone }) {
  const funds = Object.fromEntries(catalog.map((item) => {
    const profile = profiles.find((p) => p.isin === item.isin);
    const zones = {};
    Object.entries(profile?.pays || {}).forEach(([country, value]) => {
      const zone = geographicZone(country);
      zones[zone] = (zones[zone] || 0) + value;
    });
    return [item.isin, { ...item, ...profile, nom: item.nom, name: item.nom, fee: item.frais_gestion_et_administration_pct_an,
      size: sizes[item.isin]?.encours_fonds_eur, sizeDate: sizes[item.isin]?.date,
      zones: normalized(zones), sectors: normalized(profile?.secteurs || {}), known: Boolean(profile?.pays && profile?.secteurs) }];
  }));
  const zoneNames = [...new Set(Object.values(funds).flatMap((f) => Object.keys(f.zones)))].sort((a, b) => a.localeCompare(b, 'fr'));
  const sectorNames = [...new Set(Object.values(funds).flatMap((f) => Object.keys(f.sectors)))].sort((a, b) => a.localeCompare(b, 'fr'));
  const dimensions = [...zoneNames.map((name) => ['zones', name]), ...sectorNames.map((name) => ['sectors', name])];
  const vectors = Object.fromEntries(Object.values(funds).map((f) => [f.isin, dimensions.map(([kind, name]) => (f[kind][name] || 0) / 100)]));
  function exposure(weights) {
    const zones = Object.fromEntries(zoneNames.map((name) => [name, 0]));
    const sectors = Object.fromEntries(sectorNames.map((name) => [name, 0]));
    let unknown = 0;
    Object.entries(weights).forEach(([isin, weight]) => {
      if (!weight || isin === CASH_ISIN) return;
      const fund = funds[isin];
      if (!fund?.known) { unknown += weight; return; }
      for (const [kind, values] of [['zones', zones], ['sectors', sectors]]) {
        Object.keys(values).forEach((name) => { values[name] += weight * (fund[kind][name] || 0) / 100; });
      }
    });
    return { zones, sectors, unknown, cash: weights[CASH_ISIN] || 0, unallocated: Math.max(0, 100 - sum(Object.values(weights))) };
  }
  function intent(weights) {
    const result = exposure(weights);
    const fallback = funds[WORLD_ISIN];
    return { zones: sum(Object.values(result.zones)) ? normalized(result.zones) : { ...fallback.zones }, sectors: sum(Object.values(result.sectors)) ? normalized(result.sectors) : { ...fallback.sectors } };
  }
  function targets(settings) {
    const world = funds[WORLD_ISIN];
    return Object.fromEntries(['zones', 'sectors'].map((kind) => {
      const names = kind === 'zones' ? zoneNames : sectorNames;
      const locked = kind === 'zones' ? settings.zoneLocks || [] : [];
      const free = names.filter((name) => !locked.includes(name));
      const mixed = Object.fromEntries(names.map((name) => [name, (world[kind][name] || 0) * (1 - settings.conviction / 100) + (settings.intent[kind][name] || 0) * settings.conviction / 100]));
      const remaining = Math.max(0, 100 - sum(names.filter((name) => locked.includes(name)).map((name) => settings.intent[kind][name] || 0)));
      const freeTotal = sum(free.map((name) => mixed[name]));
      return [kind, Object.fromEntries(names.map((name) => [name, (locked.includes(name) ? settings.intent[kind][name] || 0 : remaining * (freeTotal ? mixed[name] / freeTotal : 1 / free.length)) * settings.equity / 100]))];
    }));
  }
  function eligible(settings) {
    return Object.values(funds).filter((f) => (f.known || f.isin === CASH_ISIN)
      && f.eligible_pea && !settings.excluded?.includes(f.isin)
      && (!settings.distribution || f.distribution === settings.distribution)
      && (!settings.minSize || (f.size != null && f.size >= settings.minSize))
      && (settings.maxFee === '' || settings.maxFee == null || f.fee <= Number(settings.maxFee))
      && (settings.hedging !== 'exclude' || f.couverture_change !== 'oui'))
      .sort((a, b) => b.size - a.size || a.fee - b.fee || a.isin.localeCompare(b.isin));
  }
  function describe(weights, settings) {
    const result = exposure(weights);
    const target = targets(settings);
    const errors = dimensions.map(([kind, name]) => result[kind][name] - target[kind][name]);
    return { weights, exposure: result, target, gap: Math.sqrt(sum(errors.map((x) => x * x)) / errors.length),
      maxGap: Math.max(...errors.map(Math.abs)), fee: sum(Object.entries(weights).map(([isin, w]) => (funds[isin]?.fee || 0) * w / 100)),
      count: Object.values(weights).filter((w) => w > 0).length };
  }
  function solve(settings, variant = 'faithful') {
    const errors = [];
    const fixed = { ...settings.locks };
    const cash = Math.round((100 - settings.equity) * 10) / 10;
    if (Object.entries(fixed).some(([id, w]) => !funds[id] || !Number.isFinite(w) || w < 0 || w > 100)) return { errors: ['Un verrou est invalide. Reprenez les positions à conserver.'] };
    if (Object.entries(fixed).some(([id, w]) => w > 0 && id !== CASH_ISIN && !funds[id].known)) errors.push('Une position verrouillée n’a pas de composition vérifiée. Déverrouillez-la pour calculer les expositions.');
    if (fixed[CASH_ISIN] != null && Math.abs(fixed[CASH_ISIN] - cash) > 0.05) errors.push('Le fonds court terme est verrouillé. Ajustez le curseur actions ou déverrouillez cette position.');
    const candidates = eligible(settings);
    if (cash > 0 && fixed[CASH_ISIN] == null && !candidates.some((f) => f.isin === CASH_ISIN)) errors.push('Les critères excluent le fonds court terme. Assouplissez les frais, l’encours ou la distribution, ou choisissez 100 % d’actions.');
    if (cash > 0 || fixed[CASH_ISIN] != null) fixed[CASH_ISIN] = cash;
    const fixedTotal = sum(Object.values(fixed));
    if (fixedTotal > 100.001) errors.push('Les positions verrouillées et la poche court terme dépassent 100 %. Réduisez la poche court terme ou libérez une position.');
    const fixedCount = Object.values(fixed).filter((w) => w > 0).length;
    const slots = variant === 'simple' ? Math.max(fixedCount + (fixedTotal < 99.999 ? 1 : 0), settings.maxFunds - 1) : settings.maxFunds;
    if (fixedCount > settings.maxFunds || (fixedCount >= settings.maxFunds && fixedTotal < 99.999)) errors.push('Le nombre maximal d’ETF ne laisse pas assez de place après les verrouillages et la poche court terme.');
    const free = candidates.filter((f) => f.isin !== CASH_ISIN && fixed[f.isin] == null);
    if (fixedTotal < 99.999 && !free.length) errors.push('Aucun ETF actions ne respecte ces critères. Assouplissez les filtres.');
    if (errors.length) return { errors };
    const target = targets(settings);
    const tv = dimensions.map(([kind, name]) => target[kind][name] / 100);
    const feePenalty = variant === 'cost' ? 0.02 : 0.0005;
    const vectorFor = (w) => dimensions.map((_, i) => sum(Object.entries(w).map(([id, value]) => vectors[id][i] * value / 100)));
    const score = (v, fee) => sum(v.map((value, i) => (value - tv[i]) ** 2)) + feePenalty * fee;
    const remaining = Math.max(0, 100 - fixedTotal);
    const initialVector = vectorFor(fixed);
    let best = null;
    for (const fund of remaining ? free : [null]) {
      const weights = { ...fixed, ...(fund ? { [fund.isin]: remaining } : {}) };
      const v = fund ? initialVector.map((x, i) => x + vectors[fund.isin][i] * remaining / 100) : initialVector;
      const fee = sum(Object.entries(weights).map(([id, w]) => funds[id].fee * w / 100));
      const cost = score(v, fee);
      if (!best || cost < best.score) best = { weights, v, fee, score: cost };
    }
    // Pairwise transfers keep the budget exact. A full swap can improve a full portfolio.
    for (const step of [10, 2, 0.5, 0.1]) {
      for (let iteration = 0; iteration < 65; iteration++) {
        let move = null;
        const active = Object.keys(best.weights).filter((id) => best.weights[id] > 0 && fixed[id] == null);
        const count = Object.values(best.weights).filter((w) => w > 0).length;
        for (const from of active) for (const fund of free) {
          const to = fund.isin;
          if (from === to) continue;
          const amounts = [...new Set([Math.min(step, best.weights[from]), best.weights[from]])];
          for (const amount of amounts) {
            if (!best.weights[to] && count >= slots && amount < best.weights[from] - 0.001) continue;
            const v = best.v.map((value, i) => value + amount / 100 * (vectors[to][i] - vectors[from][i]));
            const fee = best.fee + amount / 100 * (funds[to].fee - funds[from].fee);
            const cost = score(v, fee);
            if (cost < (move?.score ?? best.score) - 1e-12) move = { from, to, amount, v, fee, score: cost };
          }
        }
        if (!move) break;
        const weights = { ...best.weights, [move.from]: Math.round((best.weights[move.from] - move.amount) * 10) / 10, [move.to]: Math.round(((best.weights[move.to] || 0) + move.amount) * 10) / 10 };
        if (!weights[move.from]) delete weights[move.from];
        best = { weights, v: move.v, fee: move.fee, score: move.score };
      }
    }
    return { ...describe(best.weights, settings), errors: [], variant };
  }
  const priceMaps = Object.fromEntries(Object.entries(prices).map(([id, item]) => [id, new Map(item.historique.filter((r) => r.cours_ajuste > 0).map((r) => [r.mois, r.cours_ajuste]))]));
  const monthIndex = (month) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5));
  function commonHistory(portfolios, period) {
    const ids = [...new Set(portfolios.flatMap((w) => Object.keys(w).filter((id) => w[id] > 0)))];
    if (!ids.length) return { available: false, reason: 'Sélectionnez au moins une allocation investie.' };
    if (ids.some((id) => !priceMaps[id]?.size)) return { available: false, reason: 'Historique indisponible pour une position. Retirez l’allocation concernée de la comparaison.' };
    const common = [...priceMaps[ids[0]].keys()].filter((m) => ids.every((id) => priceMaps[id].has(m))).sort();
    let start = common.length - 1;
    while (start > 0 && monthIndex(common[start]) - monthIndex(common[start - 1]) === 1) start--;
    const months = common.slice(Math.max(0, start)).slice(Number.isFinite(period) ? -(period + 1) : 0);
    const returns = portfolios.map((weights) => months.slice(1).map((m, i) => sum(ids.map((id) => (weights[id] || 0) / 100 * (priceMaps[id].get(m) / priceMaps[id].get(months[i]) - 1)))));
    return { available: true, dates: months, returns, start: months[0], end: months.at(-1), months: Math.max(0, months.length - 1) };
  }
  function comparePerformance(portfolios, period = Infinity) {
    const history = commonHistory(portfolios, period);
    if (!history.available) return history;
    if (history.months < 1) return { available: false, reason: 'Pas de période commune continue suffisante pour comparer ces allocations.' };
    return { available: true, start: history.start, end: history.end, months: history.months,
      limited: Number.isFinite(period) && history.months < period,
      totals: history.returns.map((returns) => (returns.reduce((value, r) => value * (1 + r), 1) - 1) * 100) };
  }
  function compareRisk(portfolios) {
    const history = commonHistory(portfolios, 60);
    if (!history.available) return history;
    const months = history.dates;
    if (months.length < 13) return { available: false, reason: `Historique commun trop court (${Math.max(0, months.length - 1)} mois ; 12 minimum).` };
    const metrics = history.returns.map((returns) => {
      const mean = sum(returns) / returns.length;
      const volatility = Math.sqrt(sum(returns.map((r) => (r - mean) ** 2)) / (returns.length - 1) * 12) * 100;
      let value = 1, peak = 1, drawdown = 0;
      for (const r of returns) { value *= 1 + r; peak = Math.max(peak, value); drawdown = Math.min(drawdown, value / peak - 1); }
      return { volatility, drawdown: drawdown * 100 };
    });
    return { available: true, start: months[0], end: months.at(-1), months: months.length - 1, metrics };
  }
  function transfers(before, after) {
    const donors = [], receivers = [];
    const b = { ...before, cash_unallocated: Math.max(0, 100 - sum(Object.values(before))) };
    const a = { ...after, cash_unallocated: Math.max(0, 100 - sum(Object.values(after))) };
    for (const id of new Set([...Object.keys(b), ...Object.keys(a)])) {
      const delta = (a[id] || 0) - (b[id] || 0);
      if (delta < -0.05) donors.push({ id, amount: -delta });
      if (delta > 0.05) receivers.push({ id, amount: delta });
    }
    donors.sort((x, y) => y.amount - x.amount); receivers.sort((x, y) => y.amount - x.amount);
    const result = [];
    for (const donor of donors) for (const receiver of receivers) {
      const amount = Math.min(donor.amount, receiver.amount);
      if (amount > 0.05) result.push({ from: donor.id, to: receiver.id, amount: Math.round(amount * 10) / 10 });
      donor.amount -= amount; receiver.amount -= amount;
    }
    return result;
  }
  function counterweights(weights, from, settings) {
    if (settings.locks[from] != null) return [];
    const amount = Math.min(10, weights[from] || 0);
    if (!amount) return [];
    const source = funds[from];
    const kind = from === CASH_ISIN ? 'zones' : Math.max(...Object.values(source.sectors), 0) >= 50 ? 'sectors' : 'zones';
    const main = Object.entries(source[kind]).sort((a, b) => b[1] - a[1])[0]?.[0];
    const before = exposure(weights);
    return eligible(settings).filter((f) => f.isin !== from && settings.locks[f.isin] == null
      && (f.isin === CASH_ISIN) === (from === CASH_ISIN))
      .map((fund) => {
        const next = { ...weights, [from]: weights[from] - amount, [fund.isin]: (weights[fund.isin] || 0) + amount };
        if (Object.values(next).filter((w) => w > 0).length > settings.maxFunds) return null;
        const delta = main ? exposure(next)[kind][main] - before[kind][main] : 0;
        return { fund, weights: next, amount, dimension: main, delta };
      }).filter((row) => row && row.delta < -0.1).sort((a, b) => a.delta - b.delta || a.fund.fee - b.fund.fee).slice(0, 3);
  }
  return { funds, zoneNames, sectorNames, exposure, intent, targets, eligible, describe, solve, compareRisk, comparePerformance, transfers, counterweights };
}

export function validateSavedModels(value, funds) {
  if (!value || value.version !== 1 || !Array.isArray(value.models)) return [];
  return value.models.filter((entry) => entry && typeof entry.id === 'string' && typeof entry.name === 'string' && entry.weights && typeof entry.weights === 'object' && !Array.isArray(entry.weights)
    && Object.entries(entry.weights).every(([id, w]) => Object.hasOwn(funds, id) && Number.isFinite(w) && w >= 0 && w <= 100)
    && sum(Object.values(entry.weights)) <= 100.01 && sum(Object.values(entry.weights)) > 0).slice(0, 12).map((entry) => ({ id: entry.id, name: entry.name.slice(0, 60), weights: entry.weights }));
}
