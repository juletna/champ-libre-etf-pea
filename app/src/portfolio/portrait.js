import { CASH_ISIN, WORLD_ISIN } from '../allocation/engine.js';

export const ROLE_LABELS = { core: 'Socle', emerging: 'Complément émergents', conviction: 'Conviction' };
const CORE = new Set(['LU1681043599', 'LU2655993207', 'FR001400U5Q4', 'FR0014017NX3', 'FR0011871128', 'FR0013412285', 'FR0011871136', 'FR0013412293', 'LU1681042864', 'LU1681042948', 'FR0013412038', 'FR0013411980', 'FR0013411998']);
const EMERGING = new Set(['FR0013412020', 'FR0010429068']);
const UNKNOWN_ZONES = new Set(['Pays non détaillés', 'Pays non classés', 'Composition indisponible']);
const total = (values) => Object.values(values).reduce((a, b) => a + b, 0);
const normalize = (values) => {
  const sum = total(values);
  return Object.fromEntries(Object.entries(values).map(([name, weight]) => [name, sum ? weight / sum * 100 : 0]));
};
const ranked = (values) => Object.entries(values).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'));
export const number = (value) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value);
export const percent = (value) => `${number(value)} %`;
export function defaultRole(isin) { return CORE.has(isin) ? 'core' : EMERGING.has(isin) ? 'emerging' : 'conviction'; }
export function roleFor(isin, roles = {}) { return Object.hasOwn(ROLE_LABELS, roles[isin]) ? roles[isin] : defaultRole(isin); }
export function validateRoles(value, funds) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, role]) => id !== CASH_ISIN && Object.hasOwn(funds, id) && Object.hasOwn(ROLE_LABELS, role)));
}
export function exposureDistance(a, b) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].reduce((sum, key) => sum + Math.abs((a[key] || 0) - (b[key] || 0)), 0) / 2;
}

export function portrait(model, weights, roles = {}) {
  const exposure = model.exposure(weights);
  const invested = total(weights);
  const equity = Math.max(0, invested - exposure.cash);
  const countries = {};
  const sleeves = { core: 0, emerging: 0, conviction: 0, cash: exposure.cash, unallocated: exposure.unallocated };
  const lines = [];
  for (const [id, weight] of Object.entries(weights)) {
    if (weight <= 0 || id === CASH_ISIN) continue;
    const role = roleFor(id, roles);
    sleeves[role] += weight;
    const fund = model.funds[id];
    lines.push({ id, weight, role, name: fund?.nom || id });
    if (!fund?.known) continue;
    for (const [country, share] of Object.entries(normalize(fund.pays || {}))) {
      if (country === 'Autres pays') continue;
      countries[country] = (countries[country] || 0) + weight * share / 100;
    }
  }
  const covered = total(countries);
  const countryCoverage = equity ? covered / equity * 100 : 0;
  const complete = equity > 0 && exposure.unknown < 0.00001;
  const geoAvailable = complete && countryCoverage >= 80;
  const firstCountry = ranked(countries)[0];
  const topSectors = ranked(exposure.sectors).filter(([, w]) => w > 0).slice(0, 3);
  const firstShare = geoAvailable ? firstCountry[1] / covered * 100 : null;
  const topShare = complete ? topSectors.reduce((sum, [, w]) => sum + w, 0) / equity * 100 : null;
  const knownZones = (values) => normalize(Object.fromEntries(Object.entries(values).filter(([name]) => !UNKNOWN_ZONES.has(name))));
  const world = model.funds[WORLD_ISIN];
  const worldCoverage = world ? total(Object.fromEntries(Object.entries(world.zones).filter(([name]) => !UNKNOWN_ZONES.has(name)))) : 0;
  const zoneCoverage = equity ? total(Object.fromEntries(Object.entries(exposure.zones).filter(([name]) => !UNKNOWN_ZONES.has(name)))) / equity * 100 : 0;
  const distanceAvailable = complete && zoneCoverage >= 80 && worldCoverage >= 80 && world?.known;
  const zones = knownZones(exposure.zones);
  const sectors = normalize(exposure.sectors);
  const referenceZones = world ? knownZones(world.zones) : {};
  const zoneDistance = distanceAvailable ? exposureDistance(zones, referenceZones) : null;
  const sectorDistance = distanceAvailable ? exposureDistance(sectors, world.sectors) : null;
  const gaps = distanceAvailable ? [...Object.keys(zones)].map((name) => ({ name, delta: zones[name] - (referenceZones[name] || 0) })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 2) : [];
  const reason = !equity ? 'Aucune poche actions.' : exposure.unknown > 0 ? `${percent(exposure.unknown)} du portefeuille sans composition vérifiée.` : 'Moins de 80 % de la poche actions détaillés par pays ou zones.';
  return { invested, equity, sleeves, lines, countries, countryCoverage, firstCountry, topSectors, exposure, gaps, zoneDistance, sectorDistance,
    geo: firstShare == null ? null : 100 - firstShare,
    sector: topShare == null ? null : 100 - topShare,
    conviction: invested > 0 ? sleeves.conviction : null,
    distance: distanceAvailable ? (zoneDistance + sectorDistance) / 2 : null,
    firstShare, topShare, reason };
}

export const INDICATORS = [
  { id: 'geo', name: 'Diversité géographique', left: 'Un pays dominant', right: 'Plus réparti' },
  { id: 'sector', name: 'Diversité sectorielle', left: 'Trois secteurs dominants', right: 'Plus réparti' },
  { id: 'conviction', name: 'Place des convictions', left: '0 % · Sans satellite', right: '100 % · Convictions' },
  { id: 'distance', name: 'Écart au MSCI World', left: 'Proche du World', right: 'Très différent' },
  { id: 'resistance', name: 'Résistance historique', left: '−100 % · Perte totale', right: '0 % · Aucun recul' },
];
export function metric(p, risk, id) {
  if (id === 'resistance') return { position: risk ? Math.max(0, 100 + risk.drawdown) : null, value: risk ? percent(risk.drawdown) : 'Indisponible', caption: 'recul maximal sur la période' };
  const position = p[id];
  const value = id === 'geo' ? p.firstShare : id === 'sector' ? p.topShare : position;
  return { position, value: value == null ? 'Indisponible' : id === 'distance' ? `${number(value)} / 100` : percent(value), caption: { geo: 'dans le premier pays détaillé', sector: 'dans les trois premiers secteurs', conviction: 'du portefeuille en satellites', distance: 'écart des zones et secteurs' }[id] };
}
export function recoveryLabel(risk) {
  if (!risk) return 'Indisponible';
  if (risk.drawdown === 0) return 'Aucun recul';
  return risk.recoveryMonths == null ? `Non récupéré (${risk.underwaterMonths} mois depuis le sommet)` : `${risk.recoveryMonths} mois depuis le sommet`;
}
export function explain(p, risk, id, riskReason) {
  if (id !== 'resistance' && p[id] == null) return { title: 'Des données manquent pour conclure.', text: p.reason, facts: [] };
  if (id === 'geo') return { title: `${p.firstCountry[0]} arrive en tête.`, text: `Ce pays représente ${percent(p.firstCountry[1])} du portefeuille total et ${percent(p.firstShare)} des pays détaillés de la poche actions. Les ETF sont regroupés par exposition réelle : multiplier les lignes ne suffit pas à diversifier.`, facts: [`Pays détaillés : ${percent(p.countryCoverage)} des actions`, '« Autres pays » exclu de la jauge'] };
  if (id === 'sector') return { title: 'Trois secteurs donnent le ton.', text: `${p.topSectors.map(([name]) => name).join(', ')} représentent ensemble ${percent(p.topShare)} de la poche actions. Les ETF sectoriels renforcent les expositions déjà présentes dans les indices larges. Finance ne signifie pas uniquement banques ; technologie ne mesure pas l’exposition à l’IA.`, facts: p.topSectors.map(([name, value]) => `${name} : ${percent(value)} du total`) };
  if (id === 'conviction') return { title: p.sleeves.conviction > 0 ? 'Des convictions à l’intérieur du portefeuille.' : 'Aucune ligne classée en conviction.', text: `Le socle représente ${percent(p.sleeves.core)}, le complément émergents ${percent(p.sleeves.emerging)} et les convictions ${percent(p.sleeves.conviction)} du portefeuille total. Ce classement exprime le rôle des lignes, pas leur contribution au risque. Vous pouvez modifier chaque rôle ci-dessous.`, facts: p.lines.filter((line) => line.role === 'conviction').sort((a, b) => b.weight - a.weight).slice(0, 2).map((line) => `${line.name} : ${percent(line.weight)}`) };
  if (id === 'distance') return { title: p.distance < 0.05 ? 'Des expositions proches du repère mondial.' : 'Vos choix s’écartent du repère mondial.', text: `L’écart mesure les répartitions de la poche actions : ${number(p.zoneDistance)} points pour les zones et ${number(p.sectorDistance)} pour les secteurs, moyennés à parts égales. Ce n’est ni une note de qualité ni une prévision de rendement. Il ne mesure pas les différences entre sociétés ou les couvertures de change.`, facts: p.gaps.map((gap) => `${gap.name} : ${gap.delta > 0 ? '+' : ''}${number(gap.delta)} pts vs World`) };
  if (!risk) return { title: 'Un historique plus long est nécessaire.', text: riskReason || 'Douze mois continus minimum sont nécessaires.', facts: [] };
  return { title: risk.drawdown < 0 ? `Un recul maximal de ${percent(risk.drawdown)} sur la période.` : 'Aucun recul entre fins de mois sur cette période.', text: `Cette baisse va d’un sommet au creux suivant. Le délai de récupération porte sur cet épisode, du sommet jusqu’au retour à son niveau. Les observations mensuelles peuvent masquer des baisses plus fortes en cours de mois. Le solde non alloué réduit mécaniquement les fluctuations.`, facts: [`Volatilité annualisée : ${percent(risk.volatility)}`, `Récupération : ${recoveryLabel(risk)}`] };
}
export function comparisonText(a, b, riskA, riskB, id) {
  if (id === 'resistance') {
    if (!riskA || !riskB) return 'Résistance non comparable : historique commun insuffisant.';
    const delta = Math.abs(riskB.drawdown) - Math.abs(riskA.drawdown);
    const decline = Math.abs(delta) < 0.05 ? 'Reculs maximaux similaires sur la période commune.' : `Le recul maximal est ${delta > 0 ? 'plus' : 'moins'} marqué de ${number(Math.abs(delta))} points sur la période commune.`;
    return `${decline} Volatilité annualisée : ${percent(riskA.volatility)} → ${percent(riskB.volatility)}. Récupération : ${recoveryLabel(riskA)} → ${recoveryLabel(riskB)}.`;
  }
  if (a[id] == null || b[id] == null) return 'Données insuffisantes pour comparer cet indicateur.';
  const delta = b[id] - a[id];
  if (Math.abs(delta) < 0.05) return 'Cet indicateur reste similaire.';
  const direction = delta > 0 ? 'augmente' : 'diminue';
  if (id === 'geo') return `La part du premier pays, parmi les pays détaillés, ${delta > 0 ? 'diminue' : 'augmente'} de ${number(Math.abs(delta))} points. Couverture détaillée : ${percent(a.countryCoverage)} → ${percent(b.countryCoverage)} des actions.`;
  if (id === 'sector') return `Le poids des trois premiers secteurs ${delta > 0 ? 'diminue' : 'augmente'} de ${number(Math.abs(delta))} points dans la poche actions.`;
  return `${id === 'conviction' ? 'La part classée en conviction' : 'L’écart au MSCI World'} ${direction} de ${number(Math.abs(delta))} points.`;
}
