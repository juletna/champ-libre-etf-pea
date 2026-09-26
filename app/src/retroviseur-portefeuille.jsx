import React, { useMemo, useState } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import DATA from "./etf_returns.json";

/* ------------------------------------------------------------------ */
/*  COUCHE DONNÉES — vraies VL mensuelles.                             */
/*  etf_returns.json est produit par fetch_etf_history.py (yfinance,   */
/*  total return, dividendes réinvestis). `supports` décrit les ETF,   */
/*  `returns` contient les rendements mensuels simples par support.    */
/*  Les séries n'ont pas la même longueur : chaque ETF a sa propre     */
/*  ancienneté, d'où l'alignement sur la fin des séries dans backtest. */
/* ------------------------------------------------------------------ */

const ASSETS = DATA.supports;
const MONTHLY = DATA.returns;

const REGION_COLORS = {
  Monde: "#34D399",
  "Amérique du Nord": "#5B8DEF",
  Europe: "#E0A458",
  Émergents: "#EC6F9B",
  Monétaire: "#94A3B8",
};

/* ------------------------------------------------------------------ */
/*  MOTEUR — entièrement réel.                                         */
/* ------------------------------------------------------------------ */

// IRR mensuel par bissection sur un vecteur de flux, puis annualisé
function annualIRR(flows) {
  const npv = (r) => flows.reduce((s, f, t) => s + f / Math.pow(1 + r, t), 0);
  let lo = -0.95, hi = 1.0;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const v = npv(mid);
    if (Math.abs(v) < 1e-7) { lo = hi = mid; break; }
    if (npv(lo) * v < 0) hi = mid; else lo = mid;
  }
  const rm = (lo + hi) / 2;
  return Math.pow(1 + rm, 12) - 1;
}

function backtest({ weights, mode, amount, months }) {
  // Ne garder que les supports réellement alloués (poids > 0).
  const active = ASSETS.filter((a) => (weights[a.id] || 0) > 0);
  const totW = active.reduce((s, a) => s + (weights[a.id] || 0), 0);

  // Les ETF n'ont pas la même ancienneté. On aligne sur la FIN des séries
  // (le mois le plus récent) et on limite la fenêtre à la plus courte série
  // active : impossible de remonter plus loin que le support le plus jeune.
  const shortest = active.length
    ? Math.min(...active.map((a) => MONTHLY[a.id].length))
    : 0;
  const win = Math.min(months, shortest);

  const blended = [];
  for (let t = 0; t < win; t++) {
    let r = 0;
    active.forEach((a) => {
      const arr = MONTHLY[a.id];
      // indexation par la queue : les win derniers mois de chaque série
      r += (weights[a.id] || 0) * arr[arr.length - win + t];
    });
    blended.push(totW > 0 ? r / totW : 0);
  }

  const series = [];
  let value = 0, invested = 0;
  const flows = [];

  // indice de marché du mix (base 100) -> pour le drawdown "risque marché"
  let idx = 100;
  let peak = 100, maxDD = 0;

  if (mode === "lump") {
    value = amount; invested = amount;
    flows.push(-amount);
    for (let t = 0; t < blended.length; t++) {
      value *= 1 + blended[t];
      idx *= 1 + blended[t];
      peak = Math.max(peak, idx);
      maxDD = Math.min(maxDD, idx / peak - 1);
      flows.push(t === blended.length - 1 ? value : 0);
      series.push({ t: t + 1, valeur: value, investi: invested });
    }
  } else {
    for (let t = 0; t < blended.length; t++) {
      value += amount; invested += amount;
      flows.push(-amount);
      value *= 1 + blended[t];
      idx *= 1 + blended[t];
      peak = Math.max(peak, idx);
      maxDD = Math.min(maxDD, idx / peak - 1);
      series.push({ t: t + 1, valeur: value, investi: invested });
    }
    flows.push(value);
  }

  const gain = value - invested;
  const gainPct = invested > 0 ? gain / invested : 0;
  const irr = annualIRR(flows);

  // usedMonths = fenêtre réellement couverte (peut être < months demandé
  // si l'historique manque de profondeur pour ce mélange).
  return { value, invested, gain, gainPct, irr, maxDD, series, usedMonths: win, reqMonths: months };
}

/* ------------------------------------------------------------------ */
/*  FORMATAGE                                                          */
/* ------------------------------------------------------------------ */
const fEur = (n) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const fEur2 = (n) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);
const fPct = (n) =>
  (n >= 0 ? "+" : "") + new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 }).format(n);

/* ------------------------------------------------------------------ */
/*  PRESETS                                                            */
/* ------------------------------------------------------------------ */
const PRESETS = [
  { nom: "Monde seul", w: { world: 100 } },
  { nom: "Monde + Émergents", w: { world: 50, em: 50 } },
  { nom: "Offensif tech", w: { usa: 35, tech: 45, world: 20 } },
  { nom: "Prudent", w: { world: 50, cash: 50 } },
  { nom: "Réparti large", w: { usa: 30, eur: 25, em: 20, world: 25 } },
];

/* ------------------------------------------------------------------ */
/*  COMPOSANT                                                          */
/* ------------------------------------------------------------------ */
export default function Retroviseur() {
  const [raw, setRaw] = useState({ world: 100, usa: 0, tech: 0, eur: 0, em: 0, cash: 0 });
  const [mode, setMode] = useState("lump"); // lump | dca
  const [amount, setAmount] = useState(100);
  const [years, setYears] = useState(3);

  const months = years * 12;
  const sumRaw = ASSETS.reduce((s, a) => s + (raw[a.id] || 0), 0);

  const result = useMemo(
    () => backtest({ weights: raw, mode, amount, months }),
    [raw, mode, amount, months]
  );

  // référence "100% Monde" pour la même config
  const ref = useMemo(
    () => backtest({ weights: { world: 100 }, mode, amount, months }),
    [mode, amount, months]
  );
  const deltaVsMonde = result.value - ref.value;

  // La fenêtre réelle peut être plus courte que l'horizon demandé si
  // l'historique manque : on le signale plutôt que de mentir sur la durée.
  const truncated = result.usedMonths < months && result.usedMonths > 0;

  // exposition géographique agrégée
  const geo = useMemo(() => {
    const m = {};
    ASSETS.forEach((a) => {
      const w = raw[a.id] || 0;
      if (w > 0) m[a.region] = (m[a.region] || 0) + w;
    });
    const total = Object.values(m).reduce((s, v) => s + v, 0) || 1;
    return Object.entries(m)
      .map(([region, v]) => ({ region, pct: v / total }))
      .sort((x, y) => y.pct - x.pct);
  }, [raw]);

  const chartData = useMemo(() => {
    const refMap = {};
    ref.series.forEach((p) => (refMap[p.t] = p.valeur));
    return result.series.map((p) => ({ ...p, monde: refMap[p.t] }));
  }, [result, ref]);

  const setPreset = (w) => {
    const next = { world: 0, usa: 0, tech: 0, eur: 0, em: 0, cash: 0, ...w };
    setRaw(next);
  };

  const gainPos = result.gain >= 0;

  return (
    <div style={S.page}>
      <style>{CSS}</style>

      {/* HEADER */}
      <header style={S.header}>
        <div style={S.eyebrow}>BACKTEST · PEA · DONNÉES RÉELLES</div>
        <h1 style={S.h1}>Rétroviseur</h1>
        <p style={S.sub}>
          Et si tu avais investi il y a {years} ans ? Mélange les supports, règle les parts,
          et lis le résultat comme on lit un cadran.
        </p>
      </header>

      <div className="rv-grid" style={S.grid}>
        {/* COLONNE GAUCHE — RÉGLAGES */}
        <section style={S.panel}>
          <div style={S.panelLabel}>01 — Comment tu investis</div>

          <div style={S.segWrap}>
            <button
              onClick={() => setMode("lump")}
              style={{ ...S.seg, ...(mode === "lump" ? S.segOn : {}) }}
            >
              Une fois
            </button>
            <button
              onClick={() => setMode("dca")}
              style={{ ...S.seg, ...(mode === "dca" ? S.segOn : {}) }}
            >
              Chaque mois
            </button>
          </div>

          <div style={S.amountRow}>
            <label style={S.fieldLabel}>
              {mode === "lump" ? "Montant placé une fois" : "Versement mensuel"}
            </label>
            <div style={S.amountInputWrap}>
              <input
                type="number"
                min={10}
                step={10}
                value={amount}
                onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                style={S.amountInput}
              />
              <span style={S.amountUnit}>€</span>
            </div>
          </div>

          <div style={{ marginTop: 22 }}>
            <div style={S.fieldLabelRow}>
              <span style={S.fieldLabel}>Horizon</span>
              <span style={S.horizonVal}>{years} an{years > 1 ? "s" : ""}</span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={years}
              onChange={(e) => setYears(Number(e.target.value))}
              style={S.range}
            />
            <div style={S.rangeTicks}>
              {[1, 2, 3, 4, 5].map((y) => (
                <span key={y} style={{ opacity: y === years ? 1 : 0.4 }}>{y}</span>
              ))}
            </div>
          </div>

          <div style={S.divider} />

          <div style={S.panelLabel}>02 — Ton mélange</div>

          <div style={S.presets}>
            {PRESETS.map((p) => (
              <button key={p.nom} onClick={() => setPreset(p.w)} style={S.presetBtn}>
                {p.nom}
              </button>
            ))}
          </div>

          <div style={S.sliders}>
            {ASSETS.map((a) => {
              const v = raw[a.id] || 0;
              const eff = sumRaw > 0 ? v / sumRaw : 0;
              const dispo = MONTHLY[a.id] ? MONTHLY[a.id].length : 0;
              return (
                <div key={a.id} style={S.sliderRow}>
                  <div style={S.sliderHead}>
                    <span style={S.assetName}>
                      <span style={{ ...S.dot, background: a.color }} />
                      {a.nom}
                      <span style={S.assetIndice}>{a.indice}</span>
                    </span>
                    <span style={{ ...S.assetEff, color: v > 0 ? "#E8EDF2" : "#5A6675" }}>
                      {Math.round(eff * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={v}
                    onChange={(e) => setRaw({ ...raw, [a.id]: Number(e.target.value) })}
                    style={{ ...S.range, accentColor: a.color }}
                  />
                  <div style={S.assetHist}>{dispo} mois d'historique</div>
                </div>
              );
            })}
          </div>

          {sumRaw === 0 && (
            <div style={S.warn}>Aucune part allouée — règle au moins un curseur.</div>
          )}
        </section>

        {/* COLONNE DROITE — RÉSULTATS */}
        <section style={S.results}>
          {truncated && (
            <div style={S.info}>
              Historique limité à <strong>{result.usedMonths} mois</strong> (~{(result.usedMonths / 12).toFixed(1)} an
              {result.usedMonths >= 24 ? "s" : ""}) au lieu des {months} demandés :
              l'un des supports choisis est trop récent. Le résultat porte sur cette fenêtre réelle.
            </div>
          )}

          {/* CADRAN PRINCIPAL */}
          <div style={S.readout}>
            <div style={S.readoutTop}>
              <span style={S.readoutLabel}>Valeur aujourd'hui</span>
              <span style={S.readoutInvested}>investi · {fEur(result.invested)}</span>
            </div>
            <div style={S.readoutValue}>{fEur2(result.value)}</div>
            <div style={S.readoutDelta}>
              <span style={{ color: gainPos ? "#34D399" : "#F2616B", fontWeight: 600 }}>
                {result.gain >= 0 ? "+" : ""}{fEur2(result.gain)} ({fPct(result.gainPct)})
              </span>
              <span style={S.readoutDeltaSub}>plus-value latente</span>
            </div>
          </div>

          {/* MÉTRIQUES */}
          <div style={S.metrics}>
            <Metric
              label="Rendement annualisé"
              hint={mode === "dca" ? "TRI, pondéré par tes versements" : "annualisé sur la période"}
              value={result.irr == null ? "—" : fPct(result.irr)}
              tone={result.irr != null && result.irr < 0 ? "neg" : "pos"}
            />
            <Metric
              label="Pire baisse traversée"
              hint="repli max du mélange (risque marché)"
              value={fPct(result.maxDD)}
              tone="warn"
            />
            <Metric
              label="vs 100% Monde"
              hint="même montant, même horizon"
              value={`${deltaVsMonde >= 0 ? "+" : ""}${fEur(deltaVsMonde)}`}
              tone={deltaVsMonde >= 0 ? "pos" : "neg"}
            />
          </div>

          {/* COURBE */}
          <div style={S.chartCard}>
            <div style={S.chartHead}>
              <span style={S.chartTitle}>Trajectoire</span>
              <div style={S.legend}>
                <Leg color="#34D399" label="Ton mélange" />
                <Leg color="#E0A458" label="Investi" dashed />
                <Leg color="#5B8DEF" label="100% Monde" faint />
              </div>
            </div>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34D399" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#34D399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#23303F" vertical={false} />
                  <XAxis
                    dataKey="t"
                    tick={{ fill: "#6B7888", fontSize: 11 }}
                    tickFormatter={(t) => (t % 12 === 0 ? `${t / 12}a` : "")}
                    axisLine={{ stroke: "#23303F" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#6B7888", fontSize: 11 }}
                    tickFormatter={(v) => `${Math.round(v)}€`}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip content={<ChartTip />} />
                  <Line
                    type="monotone"
                    dataKey="monde"
                    stroke="#5B8DEF"
                    strokeWidth={1.5}
                    strokeOpacity={0.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="investi"
                    stroke="#E0A458"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="valeur"
                    stroke="#34D399"
                    strokeWidth={2.5}
                    fill="url(#gv)"
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* EXPOSITION GÉO */}
          <div style={S.geoCard}>
            <div style={S.chartTitle}>Exposition agrégée</div>
            <div style={S.geoBar}>
              {geo.map((g) => (
                <div
                  key={g.region}
                  style={{
                    width: `${g.pct * 100}%`,
                    background: REGION_COLORS[g.region] || "#666",
                  }}
                  title={`${g.region} ${Math.round(g.pct * 100)}%`}
                />
              ))}
            </div>
            <div style={S.geoLegend}>
              {geo.map((g) => (
                <span key={g.region} style={S.geoItem}>
                  <span style={{ ...S.dot, background: REGION_COLORS[g.region] || "#666" }} />
                  {g.region}
                  <strong style={{ marginLeft: 4 }}>{Math.round(g.pct * 100)}%</strong>
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>

      <footer style={S.footer}>
        VL mensuelles réelles récupérées via <strong>yfinance</strong> (cours de clôture ajustés,
        dividendes réinvestis), agrégées par fetch_etf_history.py. Les séries démarrent à des dates
        différentes selon l'ancienneté de chaque ETF. Les performances passées ne préjugent pas des
        performances futures.
      </footer>
    </div>
  );
}

function Metric({ label, hint, value, tone }) {
  const color = tone === "neg" ? "#F2616B" : tone === "warn" ? "#E0A458" : "#34D399";
  return (
    <div style={S.metric}>
      <div style={S.metricLabel}>{label}</div>
      <div style={{ ...S.metricValue, color }}>{value}</div>
      <div style={S.metricHint}>{hint}</div>
    </div>
  );
}

function Leg({ color, label, dashed, faint }) {
  return (
    <span style={S.legItem}>
      <span
        style={{
          width: 14,
          height: 0,
          borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}`,
          opacity: faint ? 0.6 : 1,
          display: "inline-block",
        }}
      />
      {label}
    </span>
  );
}

function ChartTip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const get = (k) => payload.find((p) => p.dataKey === k)?.value;
  return (
    <div style={S.tip}>
      <div style={S.tipRow}>
        <span>Mélange</span><strong>{fEur2(get("valeur"))}</strong>
      </div>
      <div style={{ ...S.tipRow, color: "#E0A458" }}>
        <span>Investi</span><strong>{fEur2(get("investi"))}</strong>
      </div>
      <div style={{ ...S.tipRow, color: "#5B8DEF" }}>
        <span>100% Monde</span><strong>{fEur2(get("monde"))}</strong>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  STYLES                                                            */
/* ------------------------------------------------------------------ */
const mono = "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace";
const sans = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const S = {
  page: {
    background: "#0E141C",
    color: "#E8EDF2",
    fontFamily: sans,
    minHeight: "100%",
    padding: "32px 24px 48px",
    boxSizing: "border-box",
  },
  header: { maxWidth: 1080, margin: "0 auto 28px" },
  eyebrow: { fontFamily: mono, fontSize: 11, letterSpacing: "0.18em", color: "#5B8DEF", marginBottom: 10 },
  h1: { fontSize: 42, fontWeight: 800, margin: 0, letterSpacing: "-0.02em", lineHeight: 1 },
  sub: { color: "#8A97A6", fontSize: 15, marginTop: 10, maxWidth: 520, lineHeight: 1.5 },

  grid: { maxWidth: 1080, margin: "0 auto", display: "grid", gridTemplateColumns: "360px 1fr", gap: 20 },

  panel: { background: "#151D27", border: "1px solid #1F2B38", borderRadius: 16, padding: 22 },
  panelLabel: { fontFamily: mono, fontSize: 11, letterSpacing: "0.14em", color: "#6B7888", marginBottom: 14 },

  segWrap: { display: "flex", gap: 4, background: "#0E141C", padding: 4, borderRadius: 10, border: "1px solid #1F2B38" },
  seg: {
    flex: 1, padding: "9px 0", borderRadius: 7, border: "none", background: "transparent",
    color: "#8A97A6", fontFamily: sans, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all .15s",
  },
  segOn: { background: "#243140", color: "#E8EDF2" },

  amountRow: { marginTop: 20 },
  fieldLabel: { fontSize: 13, color: "#8A97A6", fontWeight: 500 },
  fieldLabelRow: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 },
  amountInputWrap: { display: "flex", alignItems: "center", marginTop: 8, background: "#0E141C", border: "1px solid #1F2B38", borderRadius: 10, padding: "0 14px" },
  amountInput: {
    flex: 1, background: "transparent", border: "none", color: "#E8EDF2",
    fontFamily: mono, fontSize: 22, fontWeight: 600, padding: "12px 0", outline: "none", width: "100%",
  },
  amountUnit: { fontFamily: mono, fontSize: 18, color: "#6B7888" },

  horizonVal: { fontFamily: mono, fontSize: 15, fontWeight: 700, color: "#E8EDF2" },
  range: { width: "100%", accentColor: "#34D399", cursor: "pointer" },
  rangeTicks: { display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 11, color: "#6B7888", marginTop: 4 },

  divider: { height: 1, background: "#1F2B38", margin: "24px 0" },

  presets: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 },
  presetBtn: {
    fontSize: 12, fontWeight: 600, color: "#A9B6C4", background: "#0E141C",
    border: "1px solid #243140", borderRadius: 999, padding: "6px 12px", cursor: "pointer", transition: "all .15s",
  },

  sliders: { display: "flex", flexDirection: "column", gap: 16 },
  sliderRow: {},
  sliderHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  assetName: { display: "flex", alignItems: "center", fontSize: 14, fontWeight: 600, gap: 8 },
  assetIndice: { fontSize: 11, color: "#6B7888", fontWeight: 400, marginLeft: 2 },
  assetEff: { fontFamily: mono, fontSize: 14, fontWeight: 700 },
  assetHist: { fontFamily: mono, fontSize: 10, color: "#5A6675", marginTop: 4 },
  dot: { width: 9, height: 9, borderRadius: 999, display: "inline-block", flexShrink: 0 },

  warn: { marginTop: 14, fontSize: 12, color: "#E0A458", background: "#1E1A12", border: "1px solid #3A3018", borderRadius: 8, padding: "8px 12px" },
  info: { fontSize: 12.5, color: "#9DB4D6", background: "#141C28", border: "1px solid #23374F", borderRadius: 10, padding: "10px 14px", lineHeight: 1.5 },

  results: { display: "flex", flexDirection: "column", gap: 16 },

  readout: { background: "linear-gradient(160deg,#16202B,#121A23)", border: "1px solid #243140", borderRadius: 16, padding: "22px 24px" },
  readoutTop: { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  readoutLabel: { fontFamily: mono, fontSize: 11, letterSpacing: "0.14em", color: "#6B7888", textTransform: "uppercase" },
  readoutInvested: { fontFamily: mono, fontSize: 12, color: "#8A97A6" },
  readoutValue: { fontFamily: mono, fontSize: 46, fontWeight: 700, letterSpacing: "-0.02em", margin: "6px 0 4px", lineHeight: 1 },
  readoutDelta: { display: "flex", alignItems: "baseline", gap: 10, fontFamily: mono, fontSize: 16 },
  readoutDeltaSub: { fontSize: 12, color: "#6B7888", fontFamily: sans },

  metrics: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 },
  metric: { background: "#151D27", border: "1px solid #1F2B38", borderRadius: 14, padding: "16px 16px" },
  metricLabel: { fontSize: 12, color: "#8A97A6", fontWeight: 500, marginBottom: 8 },
  metricValue: { fontFamily: mono, fontSize: 24, fontWeight: 700, letterSpacing: "-0.01em" },
  metricHint: { fontSize: 11, color: "#5A6675", marginTop: 6, lineHeight: 1.4 },

  chartCard: { background: "#151D27", border: "1px solid #1F2B38", borderRadius: 16, padding: "18px 18px 8px" },
  chartHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 },
  chartTitle: { fontSize: 14, fontWeight: 700 },
  legend: { display: "flex", gap: 14 },
  legItem: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#8A97A6" },

  geoCard: { background: "#151D27", border: "1px solid #1F2B38", borderRadius: 16, padding: 18 },
  geoBar: { display: "flex", height: 14, borderRadius: 999, overflow: "hidden", margin: "14px 0 12px", background: "#0E141C", gap: 2 },
  geoLegend: { display: "flex", flexWrap: "wrap", gap: 14 },
  geoItem: { display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#A9B6C4" },

  tip: { background: "#0B1119", border: "1px solid #243140", borderRadius: 10, padding: "10px 12px", fontFamily: mono, fontSize: 12.5, minWidth: 150 },
  tipRow: { display: "flex", justifyContent: "space-between", gap: 16, padding: "2px 0", color: "#34D399" },

  footer: { maxWidth: 1080, margin: "26px auto 0", fontSize: 12, color: "#5A6675", lineHeight: 1.6, borderTop: "1px solid #1F2B38", paddingTop: 16 },
};

const CSS = `
  @media (max-width: 820px) {
    .rv-grid { grid-template-columns: 1fr !important; }
  }
  input[type=range] { height: 4px; border-radius: 999px; }
  button:hover { filter: brightness(1.12); }
  *:focus-visible { outline: 2px solid #5B8DEF; outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`;
