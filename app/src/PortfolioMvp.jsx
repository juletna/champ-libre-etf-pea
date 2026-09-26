import { useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import profilesData from "./data/mvp-profiles.json";
import pricesData from "./data/mvp-prices.json";
import catalogData from "./etf_pea_fortuneo_amundi.json";
import "./portfolio-mvp.css";

const ANALYZED = Object.fromEntries(profilesData.etfs.map((item) => [item.isin, item]));
const CATEGORY_COLORS = {
  "Court terme": "#8caaa0", Monde: "#8bd4a5", US: "#f4bd77",
  "France/EMU": "#e6a7aa", Europe: "#73b8ad", Japon: "#d4ad76",
  Emergents: "#b99ae1", Asie: "#9ca9d8", "Thématiques": "#c9a884",
};
const PROFILES = catalogData.etf.map((item) => ({
  isin: item.isin,
  nom: item.nom,
  nom_court: item.nom.replace(/^Amundi /, ""),
  indice: item.categorie_fortuneo,
  famille: item.categorie_fortuneo,
  couleur: CATEGORY_COLORS[item.categorie_fortuneo] || "#8caaa0",
  ...ANALYZED[item.isin],
}));
const ANALYZED_COUNT = profilesData.etfs.length;
const CATALOG = Object.fromEntries(catalogData.etf.map((item) => [item.isin, item]));
const INITIAL = {
  LU1681043599: 60,
  FR0011871128: 25,
  FR0011871110: 0,
  LU1829219390: 15,
};
const PERIODS = [
  { label: "1 an", months: 12 },
  { label: "3 ans", months: 36 },
  { label: "5 ans", months: 60 },
  { label: "Max", months: Infinity },
];
const EURO_AREA = new Set([
  "Allemagne", "Autriche", "Belgique", "Bulgarie", "Chypre", "Croatie", "Espagne", "Estonie",
  "Finlande", "France", "Grèce", "Irlande", "Italie", "Lettonie", "Lituanie", "Luxembourg",
  "Malte", "Pays-Bas", "Portugal", "Slovaquie", "Slovénie",
]);
const EUROPE_OUTSIDE_EURO = new Set([
  "Danemark", "Hongrie", "Islande", "Norvège", "Pologne", "République tchèque", "Roumanie",
  "Royaume-Uni", "Suède", "Suisse",
]);
const EAST_ASIA = new Set(["Chine", "Corée du Sud", "Taïwan"]);
const SOUTH_SOUTHEAST_ASIA = new Set(["Inde", "Indonésie", "Malaisie", "Thaïlande"]);
const AMERICAS_OUTSIDE_US = new Set(["Brésil", "Canada", "Mexique"]);
const AFRICA_MIDDLE_EAST = new Set(["Afrique du Sud", "Arabie saoudite", "Égypte", "Émirats arabes unis", "Éthiopie", "Iran"]);
const BRICS_MEMBERS = new Set([
  "Afrique du Sud", "Arabie saoudite", "Brésil", "Chine", "Égypte", "Émirats arabes unis",
  "Éthiopie", "Inde", "Indonésie", "Iran", "Russie",
]);
const LINE_COLORS = {
  LU1681043599: "#3e9863",
  FR0011871128: "#cb8832",
  FR0011871110: "#697bc6",
  LU1829219390: "#c65d68",
  FR0013412038: "#258f82",
  FR0013411980: "#a77935",
  FR0013412020: "#8d68b6",
};
const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const pct = (value) => `${nf.format(value)} %`;
const formatPoints = (value) => `${value > 0 ? "+" : ""}${nf.format(value)} pt${Math.abs(value) >= 2 ? "s" : ""}`;
const monthsLabel = (month) => new Date(`${month}-01T12:00:00`).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
const dateLabel = (date) => new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function redistribute(weights, lockedIsins, isin, requested) {
  if (lockedIsins.includes(isin)) return weights;
  const next = { ...weights };
  const lockedTotal = lockedIsins.reduce((sum, lockedIsin) => sum + (weights[lockedIsin] || 0), 0);
  const available = Math.max(0, Math.round((100 - lockedTotal) * 10) / 10);
  const value = Math.round(Math.min(available, Math.max(0, Number(requested) || 0)) * 10) / 10;
  const others = PROFILES.filter((etf) => etf.isin !== isin && !lockedIsins.includes(etf.isin) && (weights[etf.isin] || 0) > 0);
  if (!others.length) {
    next[isin] = value;
    return next;
  }
  const otherSum = others.reduce((sum, etf) => sum + weights[etf.isin], 0);
  next[isin] = value;
  let allocated = value;
  others.forEach((etf, index) => {
    const remaining = Math.max(0, Math.round((available - allocated) * 10) / 10);
    const adjusted = index === others.length - 1
      ? remaining
      : Math.min(remaining, Math.round(((available - value) * weights[etf.isin] / otherSum) * 10) / 10);
    next[etf.isin] = adjusted;
    allocated += next[etf.isin];
  });
  return next;
}

function addEtf(weights, lockedIsins, isin) {
  if (weights[isin] > 0) return weights;
  const lockedTotal = lockedIsins.reduce((sum, lockedIsin) => sum + (weights[lockedIsin] || 0), 0);
  const available = Math.max(0, Math.round((100 - lockedTotal) * 10) / 10);
  const otherUnlocked = PROFILES.some((etf) => etf.isin !== isin && !lockedIsins.includes(etf.isin) && weights[etf.isin] > 0);
  return redistribute(weights, lockedIsins, isin, otherUnlocked ? Math.min(10, available) : available);
}

function aggregate(weights, key) {
  const map = new Map();
  PROFILES.forEach((etf) => {
    const weight = weights[etf.isin] || 0;
    if (!weight) return;
    const breakdown = etf[key];
    if (!breakdown) {
      map.set("Composition indisponible", (map.get("Composition indisponible") || 0) + weight);
      return;
    }
    const reportedSum = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
    Object.entries(breakdown).forEach(([name, share]) => {
      map.set(name, (map.get(name) || 0) + weight * share / reportedSum);
    });
  });
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function aggregateContributions(contributions, key) {
  const map = new Map();
  PROFILES.forEach((etf) => {
    const contribution = contributions[etf.isin] || 0;
    const breakdown = etf[key];
    if (!breakdown) return;
    const reportedSum = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
    Object.entries(breakdown).forEach(([name, share]) => {
      map.set(name, (map.get(name) || 0) + contribution * share / reportedSum);
    });
  });
  return map;
}

function withContributions(rows, contributions) {
  return rows.map((row) => ({ ...row, contribution: contributions.get(row.name) || 0 }));
}

function geographicZone(name) {
  if (name === "Composition indisponible") return name;
  if (name === "Non alloué") return "Non alloué";
  if (name === "Autres pays") return "Pays non détaillés";
  if (name === "États-Unis") return "États-Unis";
  if (EURO_AREA.has(name)) return "Zone euro";
  if (EUROPE_OUTSIDE_EURO.has(name)) return "Europe hors zone euro";
  if (name === "Japon") return "Japon";
  if (EAST_ASIA.has(name)) return "Asie de l'Est hors Japon";
  if (SOUTH_SOUTHEAST_ASIA.has(name)) return "Asie du Sud et du Sud-Est";
  if (AMERICAS_OUTSIDE_US.has(name)) return "Amériques hors États-Unis";
  if (AFRICA_MIDDLE_EAST.has(name)) return "Afrique et Moyen-Orient";
  if (name === "Australie") return "Océanie";
  return "Pays non classés";
}

function aggregateZones(countries) {
  const zones = new Map();
  countries.forEach(({ name, value, contribution = 0 }) => {
    const zone = geographicZone(name);
    const previous = zones.get(zone) || { value: 0, contribution: 0 };
    zones.set(zone, { value: previous.value + value, contribution: previous.contribution + contribution });
  });
  return [...zones.entries()].map(([name, totals]) => ({ name, ...totals })).sort((a, b) => b.value - a.value);
}

function compactBreakdown(rows, limit = 7) {
  const unallocated = rows.find((row) => row.name === "Non alloué");
  const allocated = rows.filter((row) => row.name !== "Non alloué");
  if (allocated.length <= limit) return rows;
  const top = allocated.filter((row) => !row.name.startsWith("Autres ")).slice(0, limit);
  const names = new Set(top.map((row) => row.name));
  const other = allocated.filter((row) => !names.has(row.name)).reduce((sum, row) => ({ value: sum.value + row.value, contribution: sum.contribution + (row.contribution || 0) }), { value: 0, contribution: 0 });
  return [...top, { name: "Autres", ...other }, ...(unallocated ? [unallocated] : [])];
}

function compactCountries(rows, limit = 7) {
  const detailed = rows.filter((row) => row.name !== "Autres pays" && row.name !== "Non alloué");
  const undetailed = rows.find((row) => row.name === "Autres pays");
  const unallocated = rows.find((row) => row.name === "Non alloué");
  const top = detailed.slice(0, limit);
  const otherDetailed = detailed.slice(limit).reduce((sum, row) => ({ value: sum.value + row.value, contribution: sum.contribution + (row.contribution || 0) }), { value: 0, contribution: 0 });
  return [
    ...top,
    ...(otherDetailed.value ? [{ name: "Autres pays détaillés", ...otherDetailed }] : []),
    ...(undetailed ? [{ ...undetailed, name: "Pays non détaillés" }] : []),
    ...(unallocated ? [unallocated] : []),
  ];
}

function performance(weights, selectedIsins, requestedMonths) {
  const active = PROFILES.filter((etf) => weights[etf.isin] > 0);
  const selected = PROFILES.filter((etf) => selectedIsins.includes(etf.isin));
  const forWindow = active.length ? active : selected;
  if (!forWindow.length) return { points: [], usedMonths: 0, start: null, end: null, etfContributions: {} };
  const missingHistory = active.filter((etf) => !pricesData.par_isin[etf.isin]);
  if (missingHistory.length) return { points: [], usedMonths: 0, start: null, end: null, etfContributions: {}, missingHistory };
  const pricedSelected = selected.filter((etf) => pricesData.par_isin[etf.isin]);
  const byEtf = Object.fromEntries(pricedSelected.map((etf) => [etf.isin, new Map(pricesData.par_isin[etf.isin].historique.map((row) => [row.mois, row.cours_ajuste]))]));
  const common = [...byEtf[forWindow[0].isin].keys()]
    .filter((month) => forWindow.every((etf) => byEtf[etf.isin].has(month)))
    .sort();
  const months = Math.min(requestedMonths, common.length - 1);
  const window = common.slice(-(months + 1));
  if (window.length < 2) return { points: [], usedMonths: 0, start: null, end: null, etfContributions: {} };
  const benchmark = new Map(pricesData.par_isin.LU1681043599.historique.map((row) => [row.mois, row.cours_ajuste]));
  const benchmarkStart = benchmark.get(window[0]);
  const firstEtfPrice = Object.fromEntries(pricedSelected.map((etf) => [etf.isin, window.map((month) => byEtf[etf.isin].get(month)).find((price) => price != null)]));
  const makePoint = (month, portfolioValue) => ({
    month,
    portefeuille: Number(portfolioValue.toFixed(3)),
    monde: benchmarkStart && benchmark.get(month) ? Number((100 * benchmark.get(month) / benchmarkStart).toFixed(3)) : null,
    ...Object.fromEntries(pricedSelected.map((etf) => {
      const price = byEtf[etf.isin].get(month);
      return [`etf_${etf.isin}`, price && firstEtfPrice[etf.isin] ? Number((100 * price / firstEtfPrice[etf.isin]).toFixed(3)) : null];
    })),
  });
  const points = [makePoint(window[0], 100)];
  const etfContributions = Object.fromEntries(active.map((etf) => [etf.isin, 0]));
  let value = 100;
  for (let index = 1; index < window.length; index++) {
    const month = window[index];
    const previous = window[index - 1];
    const monthlyReturn = active.reduce((sum, etf) => {
      const prices = byEtf[etf.isin];
      const etfReturn = prices.get(month) / prices.get(previous) - 1;
      etfContributions[etf.isin] += value * weights[etf.isin] / 100 * etfReturn;
      return sum + weights[etf.isin] / 100 * etfReturn;
    }, 0);
    value *= 1 + monthlyReturn;
    points.push(makePoint(month, value));
  }
  return { points, usedMonths: window.length - 1, start: window[0], end: window.at(-1), etfContributions };
}

function ExposureCard({ title, subtitle, rows, color, date, periodLabel, controls, note, extra, countryView = false, showAll = false }) {
  const visible = countryView ? compactCountries(rows) : showAll ? rows : compactBreakdown(rows);
  return (
    <section className="mvp-card exposure-card">
      <div className="card-topline"><span className="card-kicker">COMPOSITION DES INDICES</span><span className="card-date">Compositions au {date}</span></div>
      <h2>{title}</h2>
      <p className="card-description">{subtitle}</p>
      {controls}
      <div className="exposure-columns"><span>Part actuelle</span><span>Contribution estimée · {periodLabel}</span></div>
      {visible.length ? <div className="exposure-list">
        {visible.map((row) => <div className="exposure-row" key={row.name}>
          <div className="exposure-label"><span title={row.name}>{row.name}</span><strong>{pct(row.value)}</strong><b className={row.contribution < 0 ? "negative" : ""}>{formatPoints(row.contribution || 0)}</b></div>
          <div className="exposure-track"><span style={{ width: `${Math.max(row.value, 0.7)}%`, background: color }} /></div>
        </div>)}
      </div> : <div className="empty-chart">Ajoute un ETF pour afficher la répartition.</div>}
      {extra}
      {note && <p className="exposure-note">{note}</p>}
    </section>
  );
}

function PerformanceTooltip({ active, payload, label, visibleEtfs }) {
  if (!active || !payload?.length) return null;
  const mix = payload.find((entry) => entry.dataKey === "portefeuille")?.value;
  const world = payload.find((entry) => entry.dataKey === "monde")?.value;
  return <div className="chart-tooltip">
    <strong>{monthsLabel(label)}</strong>
    {mix != null && <span>Portefeuille <b>{pct(mix - 100)}</b></span>}
    {world != null && <span>MSCI World (repère) <b>{pct(world - 100)}</b></span>}
    {visibleEtfs.map((etf) => {
      const value = payload.find((entry) => entry.dataKey === `etf_${etf.isin}`)?.value;
      return value != null && <span key={etf.isin}>{etf.nom_court} <b>{pct(value - 100)}</b></span>;
    })}
  </div>;
}

function EyeIcon({ visible }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 12s3.5-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.5 5.5-9.5 5.5S2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.5" />
    {!visible && <path d="M3 21 21 3" strokeWidth="2.2" />}
  </svg>;
}

function LockIcon({ locked }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="10" width="16" height="11" rx="2" />
    {locked ? <path d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3" /> : <path d="M7.5 10V7a4.5 4.5 0 0 1 8.8-1.3" />}
  </svg>;
}

export default function PortfolioMvp() {
  const [weights, setWeights] = useState(INITIAL);
  const [selectedIsins, setSelectedIsins] = useState(() => PROFILES.filter((etf) => INITIAL[etf.isin] > 0).map((etf) => etf.isin));
  const [lockedIsins, setLockedIsins] = useState([]);
  const [visibleEtfIsins, setVisibleEtfIsins] = useState([]);
  const [period, setPeriod] = useState(36);
  const [geoView, setGeoView] = useState("countries");
  const selected = PROFILES.filter((etf) => selectedIsins.includes(etf.isin));
  const visibleEtfs = selected.filter((etf) => visibleEtfIsins.includes(etf.isin));
  const allEtfsVisible = selected.length > 0 && visibleEtfs.length === selected.length;
  const active = selected.filter((etf) => weights[etf.isin] > 0);
  const history = useMemo(() => performance(weights, selectedIsins, period), [weights, selectedIsins, period]);
  const geo = useMemo(() => aggregate(weights, "pays"), [weights]);
  const geoContributions = useMemo(() => aggregateContributions(history.etfContributions, "pays"), [history]);
  const sectorContributions = useMemo(() => aggregateContributions(history.etfContributions, "secteurs"), [history]);
  const geoWithContributions = useMemo(() => withContributions(geo, geoContributions), [geo, geoContributions]);
  const totalWeight = selected.reduce((sum, etf) => sum + (weights[etf.isin] || 0), 0);
  const unallocated = Math.max(0, Math.round((100 - totalWeight) * 10) / 10);
  const geoRows = useMemo(() => geo.length && unallocated ? [...geoWithContributions, { name: "Non alloué", value: unallocated, contribution: 0 }] : geoWithContributions, [geoWithContributions, geo, unallocated]);
  const zones = useMemo(() => aggregateZones(geoRows), [geoRows]);
  const bricsShare = geo.filter((row) => BRICS_MEMBERS.has(row.name)).reduce((sum, row) => sum + row.value, 0);
  const bricsContribution = geoWithContributions.filter((row) => BRICS_MEMBERS.has(row.name)).reduce((sum, row) => sum + row.contribution, 0);
  const sectors = useMemo(() => aggregate(weights, "secteurs"), [weights]);
  const sectorRows = useMemo(() => {
    const rows = withContributions(sectors, sectorContributions);
    return sectors.length && unallocated ? [...rows, { name: "Non alloué", value: unallocated, contribution: 0 }] : rows;
  }, [sectors, sectorContributions, unallocated]);
  const totalReturn = history.points.length ? history.points.at(-1).portefeuille - 100 : null;
  const referenceReturn = history.points.length && history.points.at(-1).monde != null ? history.points.at(-1).monde - 100 : null;
  const performanceValue = totalReturn == null ? "—" : `${totalReturn >= 0 ? "+" : ""}${pct(totalReturn)}`;
  const referenceValue = referenceReturn == null ? "—" : `${referenceReturn >= 0 ? "+" : ""}${pct(referenceReturn)}`;
  const performanceDates = history.start && history.end ? `${monthsLabel(history.start)} → ${monthsLabel(history.end)}` : "Sélectionnez un ETF";
  const cost = active.reduce((sum, etf) => sum + weights[etf.isin] / 100 * CATALOG[etf.isin].frais_gestion_et_administration_pct_an, 0);
  const oldestReport = active.length ? active.map((etf) => etf.reporting_date).sort()[0] : null;
  const selectedCount = selected.length;
  const lockedTotal = lockedIsins.reduce((sum, isin) => sum + (weights[isin] || 0), 0);
  const availableForUnlocked = Math.max(0, Math.round((100 - lockedTotal) * 10) / 10);
  const availableMonths = history.usedMonths;
  const periodLabel = history.start && history.end ? `${monthsLabel(history.start)} → ${monthsLabel(history.end)}` : "—";
  const removeEtf = (isin) => {
    setSelectedIsins((old) => old.filter((item) => item !== isin));
    setVisibleEtfIsins((old) => old.filter((item) => item !== isin));
    const remainingLocks = lockedIsins.filter((item) => item !== isin);
    setLockedIsins(remainingLocks);
    setWeights((old) => redistribute(old, remainingLocks, isin, 0));
  };
  const selectEtf = (isin) => {
    setSelectedIsins((old) => [...old, isin]);
    setWeights((old) => addEtf(old, lockedIsins, isin));
  };
  const toggleEtfCurve = (isin) => setVisibleEtfIsins((old) => old.includes(isin) ? old.filter((item) => item !== isin) : [...old, isin]);
  const toggleAllEtfCurves = () => setVisibleEtfIsins(allEtfsVisible ? [] : selected.map((etf) => etf.isin));

  return <div className="mvp-page">
    <header className="mvp-header">
      <div className="mvp-header-inner">
        <div className="mvp-logo"><span className="mvp-logo-mark">◈</span> Champ libre <span className="mvp-logo-sub">/ PEA</span></div>
        <div className="mvp-header-actions">
          <span className="mvp-header-tag">Prototype · {PROFILES.length} ETF analysables sur {catalogData.nombre_etf}</span>
          <div className="mvp-header-performance"><span>Performance sur la période<small>{performanceDates}</small></span><div className="mvp-header-values"><strong className={totalReturn != null && totalReturn < 0 ? "negative" : ""}>{performanceValue}</strong><small>MSCI World <b>{referenceValue}</b></small></div></div>
        </div>
      </div>
    </header>
    <main className="mvp-shell">
      <section className="mvp-intro">
        <div><div className="eyebrow">PORTEFEUILLE VIRTUEL · OFFRE FORTUNEO AMUNDI</div><h1>Composez. Observez.<br/><em>Comprenez.</em></h1><p>Réglez les poids de vos ETF et voyez aussitôt ce que vous détenez vraiment — par pays, par secteur et dans le temps.</p></div>
        <div className="intro-index"><span>01 / 03</span><div className="intro-index-line"/><strong>Un premier aperçu concret</strong><small>Données mensuelles · poids rééquilibrés chaque mois</small></div>
      </section>
      <div className="mvp-layout">
        <aside className="builder-panel">
          <div className="builder-heading"><span className="card-kicker">01 — CONSTRUIRE</span><h2>Vos ETF</h2><p>Ajustez les poids et verrouillez ceux à préserver.</p></div>
          <div className="weight-total"><span>Investi</span><strong>{pct(totalWeight)}</strong></div>
          {unallocated > 0 && <div className="unallocated-total">Non alloué : {pct(unallocated)}</div>}
          <div className="builder-scroll" role="region" aria-label="Liste des ETF" tabIndex={0}>
          <div className="selected-list">
            {selected.length ? selected.map((etf) => <div className={`selected-etf${lockedIsins.includes(etf.isin) ? " locked" : ""}`} key={etf.isin}>
              <div className="etf-heading">
                <span className="etf-dot" style={{ background: etf.couleur }}/>
                <div><strong>{etf.nom_court}</strong><small>{etf.indice} · {etf.isin}</small></div>
                <button type="button" className="eye-button" aria-label={`${visibleEtfIsins.includes(etf.isin) ? "Masquer" : "Afficher"} la courbe de ${etf.nom_court}`} aria-pressed={visibleEtfIsins.includes(etf.isin)} title={`${visibleEtfIsins.includes(etf.isin) ? "Masquer" : "Afficher"} la courbe de ${etf.nom_court}`} onClick={() => toggleEtfCurve(etf.isin)}><EyeIcon visible={visibleEtfIsins.includes(etf.isin)}/></button>
                <button type="button" className="lock-button" aria-label={`${lockedIsins.includes(etf.isin) ? "Déverrouiller" : "Verrouiller"} ${etf.nom_court}`} aria-pressed={lockedIsins.includes(etf.isin)} title={`${lockedIsins.includes(etf.isin) ? "Déverrouiller" : "Verrouiller"} le poids de ${etf.nom_court}`} onClick={() => setLockedIsins((old) => old.includes(etf.isin) ? old.filter((item) => item !== etf.isin) : [...old, etf.isin])}><LockIcon locked={lockedIsins.includes(etf.isin)}/></button>
                <button type="button" className="icon-button" title={`Retirer ${etf.nom_court}`} aria-label={`Retirer ${etf.nom_court}`} onClick={() => removeEtf(etf.isin)}>×</button>
              </div>
              <div className="weight-controls"><input aria-label={`Poids de ${etf.nom_court}`} type="range" min="0" max={lockedIsins.includes(etf.isin) ? 100 : availableForUnlocked} step="1" value={weights[etf.isin]} disabled={lockedIsins.includes(etf.isin)} onChange={(event) => setWeights((old) => redistribute(old, lockedIsins, etf.isin, event.target.value))} style={{ accentColor: etf.couleur }}/><div className="weight-number"><input aria-label={`Pourcentage de ${etf.nom_court}`} type="number" min="0" max={lockedIsins.includes(etf.isin) ? 100 : availableForUnlocked} step="0.1" value={Math.round(weights[etf.isin] * 10) / 10} disabled={lockedIsins.includes(etf.isin)} onChange={(event) => setWeights((old) => redistribute(old, lockedIsins, etf.isin, event.target.value))}/><span>%</span></div></div>
            </div>) : <p className="builder-empty">Votre portefeuille est vide. Ajoutez un ETF ci-dessous.</p>}
          </div>
          <div className="add-section"><div className="add-section-heading"><span className="card-kicker">AJOUTER UN ETF</span><span>{PROFILES.length - selectedCount} disponibles</span></div>{PROFILES.filter((etf) => !selectedIsins.includes(etf.isin)).map((etf) => <button className="add-row" type="button" key={etf.isin} onClick={() => selectEtf(etf.isin)}><span className="etf-dot" style={{ background: etf.couleur }}/><span><strong>{etf.nom_court}</strong><small>{etf.famille}</small></span><b>＋</b></button>)}</div>
          <div className="builder-note">Ce prototype couvre {PROFILES.length} ETF. Les {catalogData.nombre_etf - PROFILES.length} autres seront ajoutés après validation de leurs historiques et compositions.</div>
          </div>
        </aside>
        <div className="dashboard">
          <div className="period-toolbar"><div><span className="card-kicker">PÉRIODE COMMUNE</span><small>Rendement et contributions · {periodLabel}</small></div><div className="period-tabs" role="group" aria-label="Période d’analyse">{PERIODS.map((option) => <button type="button" key={option.label} className={period === option.months ? "active" : ""} aria-pressed={period === option.months} onClick={() => setPeriod(option.months)}>{option.label}</button>)}</div></div>
          <section className="summary-grid">
            <div className="summary-card dark"><span>Performance sur la période</span><strong>{performanceValue}</strong><small>{performanceDates}</small></div>
            <div className="summary-card"><span>ETF sélectionnés</span><strong>{selectedCount}</strong><small>sur {PROFILES.length} disponibles</small></div>
            <div className="summary-card"><span>Frais annuels pondérés</span><strong>{totalWeight ? pct(cost) : "—"}</strong><small>gestion et administration</small></div>
            <div className="summary-card"><span>Premier pays</span><strong>{geo[0]?.name || "—"}</strong><small>{geo[0] ? pct(geo[0].value) : "Aucune exposition"}</small></div>
          </section>
          <section className="mvp-card performance-card">
            <div className="card-topline"><span className="card-kicker">02 — ÉVOLUTION</span><span className="card-date">Cours arrêtés à {history.end ? monthsLabel(history.end) : "—"}</span></div>
            <div className="performance-heading"><div><h2>Rendement historique</h2><p className="card-description">Base 100 · poids cibles rééquilibrés chaque mois · cours ajustés par la source{unallocated > 0 ? " · solde non alloué sans rendement" : ""}</p></div></div>
            {history.points.length ? <>
              <div className="chart-controls">
                <button type="button" onClick={toggleAllEtfCurves} disabled={!selected.length}>
                  <EyeIcon visible={allEtfsVisible}/>{allEtfsVisible ? "Masquer les courbes ETF" : "Afficher toutes les courbes ETF"}
                </button>
              </div>
              <div className="chart-legend">
                <span><i className="legend-line green"/>Votre portefeuille</span>
                <span><i className="legend-line blue"/>MSCI World (repère)</span>
                {visibleEtfs.map((etf) => <span key={etf.isin}><i className="legend-line" style={{ borderColor: LINE_COLORS[etf.isin] }}/>{etf.nom_court}</span>)}
              </div>
              <div className="performance-chart"><ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history.points} margin={{ top: 12, right: 5, left: -17, bottom: 2 }}>
                  <defs><linearGradient id="mixGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5bac7e" stopOpacity={0.25}/><stop offset="100%" stopColor="#5bac7e" stopOpacity={0.01}/></linearGradient></defs>
                  <CartesianGrid stroke="#e8ece8" vertical={false}/>
                  <XAxis dataKey="month" tick={{ fill: "#7a8881", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={35} tickFormatter={monthsLabel}/>
                  <YAxis tick={{ fill: "#7a8881", fontSize: 11 }} tickLine={false} axisLine={false} domain={["auto", "auto"]} tickFormatter={(value) => Math.round(value)}/>
                  <Tooltip content={<PerformanceTooltip visibleEtfs={visibleEtfs}/>}/>
                  {visibleEtfs.map((etf) => <Area key={etf.isin} type="monotone" dataKey={`etf_${etf.isin}`} stroke={LINE_COLORS[etf.isin]} strokeWidth={1.9} fill="transparent" dot={false} connectNulls={false} isAnimationActive={false}/>)}
                  <Area type="monotone" dataKey="monde" stroke="#a1aacd" strokeWidth={1.7} strokeDasharray="5 5" fill="transparent" dot={false}/>
                  <Area type="monotone" dataKey="portefeuille" stroke="#317b54" strokeWidth={2.7} fill="url(#mixGradient)" dot={false} activeDot={{ r: 4 }}/>
                </AreaChart>
              </ResponsiveContainer></div>
            </> : <div className="empty-chart">Ajoutez un ETF pour afficher l’historique.</div>}
            {period !== Infinity && availableMonths < period && history.points.length > 0 && <p className="chart-footnote">Historique commun limité à {availableMonths} mois pour cette sélection.</p>}
          </section>
          <div className="exposure-grid">
            <ExposureCard
              title={geoView === "countries" ? "Par pays" : "Par zones"}
              subtitle="Pays attribués aux sociétés des indices."
              rows={geoView === "countries" ? geoRows : zones}
              countryView={geoView === "countries"}
              color="#5bac7e"
              date={oldestReport ? dateLabel(oldestReport) : "—"}
              periodLabel={periodLabel}
              showAll={geoView === "zones"}
              controls={<div className="exposure-switch" role="group" aria-label="Vue géographique">
                <button type="button" aria-pressed={geoView === "countries"} onClick={() => setGeoView("countries")}>Pays</button>
                <button type="button" aria-pressed={geoView === "zones"} onClick={() => setGeoView("zones")}>Zones</button>
              </div>}
              extra={geoView === "zones" && geo.length > 0 && <div className="cross-exposure">
                <div className="exposure-label"><span>BRICS identifiés (<a href="https://brics.br/en/about-the-brics" target="_blank" rel="noreferrer">11 membres</a>)</span><strong>{pct(bricsShare)}</strong><b className={bricsContribution < 0 ? "negative" : ""}>{formatPoints(bricsContribution)}</b></div>
                <div className="exposure-track"><span style={{ width: `${bricsShare}%`, background: "#8f73b5" }}/></div>
                <small>Inclus dans les zones ci-dessus ; les pays non détaillés sont exclus de ce calcul.</small>
              </div>}
              note="Contribution indicative : rendement des ETF ventilé selon leur dernière composition publiée, supposée constante sur la période. Ce n’est pas un rendement historique propre à chaque pays ou zone. Les pays non détaillés restent séparés."
            />
            <ExposureCard title="Par secteur" subtitle="Les activités qui font varier votre portefeuille." rows={sectorRows} color="#b88a58" date={oldestReport ? dateLabel(oldestReport) : "—"} periodLabel={periodLabel} note="Contribution indicative : rendement des ETF ventilé selon leur dernière composition publiée, supposée constante sur la période. Ce n’est pas un rendement historique propre à chaque secteur."/>
          </div>
          <section className="mvp-card source-card"><div><span className="card-kicker">03 — SOURCES & MÉTHODE</span><h2>Des chiffres datés, jamais devinés.</h2><p>Les répartitions proviennent des indices présentés dans les reportings Amundi ; les cours mensuels ajustés viennent de Yahoo Finance pour ce prototype. Les frais proviennent des DIC Amundi. Les répartitions sont des instantanés, pas un historique reconstitué.</p></div><div className="source-list">{selected.map((etf) => <a key={etf.isin} href={etf.reporting_url} target="_blank" rel="noreferrer"><span>{etf.nom_court}</span><small>Composition : {dateLabel(etf.reporting_date)}</small><b>↗</b></a>)}</div></section>
        </div>
      </div>
      <footer className="mvp-footer"><span>CHAMP LIBRE / PEA</span><p>Outil de simulation. Les performances passées ne préjugent pas des performances futures. Données de cours : {pricesData.source}, extraction du {dateLabel(pricesData.date_extraction)}.</p></footer>
    </main>
  </div>;
}
