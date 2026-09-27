import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { CASH_ISIN, PRESETS, validateSavedModels, rebalanceTarget } from './engine';
import './allocation.css';

const STORAGE_KEY = 'champ-libre.allocation-models.v1';
const percent = (value, digits = 1) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(value)} %`;
const points = (value) => { const rounded = Math.round(value * 10) / 10 || 0; return `${rounded > 0 ? '+' : ''}${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(rounded)} pt`; };
const sizeLabel = (value) => value == null ? 'indisponible' : value >= 1e9 ? `${(value / 1e9).toFixed(1)} Md€` : `${Math.round(value / 1e6)} M€`;
const monthLabel = (month) => new Date(`${month}-01T12:00:00`).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
const total = (weights) => Object.values(weights).reduce((sum, w) => sum + w, 0);
const nameOf = (model, id) => id === 'cash_unallocated' ? 'Non alloué' : model.funds[id]?.name || id;

function RangeField({ label, value, onChange, min = 0, max = 100, step = 5, left, right, description }) {
  const id = `allocation-${label.replace(/[^a-zA-Z]/g, '')}`;
  return <div className="allocation-range"><label htmlFor={id}><span>{label}</span><output>{percent(value, 0)}</output></label><input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))}/>{left && <div className="allocation-endpoints"><span>{left}</span><span>{right}</span></div>}{description && <p>{description}</p>}</div>;
}

function RiskComparison({ model, before, after }) {
  const risk = useMemo(() => model.compareRisk([before, after]), [model, before, after]);
  if (!risk.available) return <p className="allocation-note">Risque historique : {risk.reason}</p>;
  return <div className="allocation-risk"><strong>Fluctuations observées · avant → après</strong><dl><div><dt>Volatilité annualisée</dt><dd>{percent(risk.metrics[0].volatility)} → {percent(risk.metrics[1].volatility)}</dd></div><div><dt>Baisse maximale (fins de mois)</dt><dd>{percent(risk.metrics[0].drawdown)} → {percent(risk.metrics[1].drawdown)}</dd></div></dl><p className="allocation-note">Même période : {monthLabel(risk.start)} – {monthLabel(risk.end)} ({risk.months} mois). Poids rétablis chaque mois ; les baisses entre deux fins de mois ne sont pas mesurées. {risk.months < 36 ? 'Historique court : comparaison fragile. ' : ''}Ces observations ne garantissent pas le risque futur.</p></div>;
}

function ExposureComparison({ result }) {
  const [kind, setKind] = useState('zones');
  const rows = Object.entries(result.target[kind]).map(([name, target]) => ({ name, target, actual: result.exposure[kind][name] || 0 })).filter((row) => row.target > 0.05 || row.actual > 0.05).sort((a, b) => b.target - a.target);
  return <div className="allocation-exposure"><div className="allocation-tabs" aria-label="Expositions comparées"><button type="button" aria-pressed={kind === 'zones'} onClick={() => setKind('zones')}>Zones</button><button type="button" aria-pressed={kind === 'sectors'} onClick={() => setKind('sectors')}>Secteurs</button></div><p className="allocation-note">Parts du portefeuille total, hors poche court terme.</p><table><thead><tr><th>Exposition</th><th>Cible</th><th>Obtenu</th><th>Écart</th></tr></thead><tbody>{rows.map((row) => <tr key={row.name}><th scope="row">{row.name}</th><td>{percent(row.target)}</td><td>{percent(row.actual)}</td><td className={Math.abs(row.actual - row.target) > 3 ? 'allocation-gap' : ''}>{points(row.actual - row.target)}</td></tr>)}</tbody></table></div>;
}

function BalancePanel({ model, base, result, pending }) {
  const flows = useMemo(() => result.weights ? model.transfers(base, result.weights) : [], [model, base, result.weights]);
  const beforeExposure = model.exposure(base);
  return <aside className="allocation-balance" aria-label="Équilibre du portefeuille" aria-busy={pending}><div className="allocation-kicker">VASES COMMUNICANTS</div><h3>Ce qui équilibre vos choix</h3>{pending && <p role="status">Actualisation des propositions…</p>}{result.errors?.length ? <div className="allocation-warning" role="alert">{result.errors.map((error) => <p key={error}>{error}</p>)}</div> : <>
    <div className="allocation-sleeves"><span style={{ flex: 100 - result.exposure.cash }}>Actions {percent(100 - result.exposure.cash, 0)}</span>{result.exposure.cash > 0 && <span style={{ flex: result.exposure.cash }}>Court terme {percent(result.exposure.cash, 0)}</span>}</div>
    {flows.length ? <><p className="allocation-note">Depuis votre point de départ. Chaque hausse est financée par une baisse.</p><ul className="allocation-flows">{flows.slice(0, 5).map((flow) => <li key={`${flow.from}-${flow.to}`}><span>{nameOf(model, flow.from)}<small>vers {nameOf(model, flow.to)}</small></span><b>{points(flow.amount)}</b></li>)}</ul>{flows.length > 5 && <details><summary>{flows.length - 5} autres mouvements</summary><ul className="allocation-flows">{flows.slice(5).map((flow) => <li key={`${flow.from}-${flow.to}`}><span>{nameOf(model, flow.from)}<small>vers {nameOf(model, flow.to)}</small></span><b>{points(flow.amount)}</b></li>)}</ul></details>}</> : <p className="allocation-note">La proposition conserve les poids du point de départ.</p>}
    <div className="allocation-concentration"><strong>Concentrations · avant → après</strong><dl><div><dt>Première zone</dt><dd>{percent(Math.max(...Object.values(beforeExposure.zones)))} → {percent(Math.max(...Object.values(result.exposure.zones)))}</dd></div><div><dt>Premier secteur</dt><dd>{percent(Math.max(...Object.values(beforeExposure.sectors)))} → {percent(Math.max(...Object.values(result.exposure.sectors)))}</dd></div></dl>{beforeExposure.unknown > 0 && <p className="allocation-note">Avant : {percent(beforeExposure.unknown)} sans composition connue, concentrations partielles.</p>}</div>
    <RiskComparison model={model} before={base} after={result.weights}/>
    <p className="allocation-note">Les mouvements montrent le financement des positions. Diversifier une exposition ne garantit pas une protection lors d’une baisse générale.</p>
  </>}</aside>;
}

export default function AllocationWizard({ model, open, onClose, weights, lockedIsins, onApply, saveRequested, resume }) {
  const dialogRef = useRef(null);
  const titleRef = useRef(null);
  const lastInputs = useRef({ weights, lockedIsins });
  const [step, setStep] = useState(0);
  const [source, setSource] = useState('current');
  const [base, setBase] = useState(weights);
  const [settings, setSettings] = useState(() => ({ intent: model.intent(weights), conviction: 100, equity: 100 - (weights[CASH_ISIN] || 0), maxFunds: Math.max(4, lockedIsins.length + 1), locks: Object.fromEntries(lockedIsins.map((id) => [id, weights[id] || 0])), minSize: 0, maxFee: '', distribution: '', hedging: 'any', excluded: [] }));
  const [models, setModels] = useState(() => { try { return validateSavedModels(JSON.parse(localStorage.getItem(STORAGE_KEY)), model.funds); } catch { return []; } });
  const [modelName, setModelName] = useState('Mon allocation');
  const [storageMessage, setStorageMessage] = useState('');
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [manual, setManual] = useState(null);
  const [counterFrom, setCounterFrom] = useState('');
  const [targetKind, setTargetKind] = useState('zones');
  const [replaceFrom, setReplaceFrom] = useState('');
  const [replaceTo, setReplaceTo] = useState('');
  const deferredSettings = useDeferredValue(settings);
  const pending = settings !== deferredSettings;
  const proposals = useMemo(() => {
    if (!open) return [];
    let faithful = model.solve(deferredSettings);
    if (faithful.errors.length) return [faithful];
    const cost = model.solve(deferredSettings, 'cost');
    const simple = model.solve(deferredSettings, 'simple');
    faithful = { ...[faithful, cost, simple].filter((p) => !p.errors.length).sort((a, b) => a.gap - b.gap || a.fee - b.fee)[0], variant: 'faithful' };
    return [faithful, ...(!cost.errors.length && cost.fee < faithful.fee - 0.001 ? [cost] : []), ...(!simple.errors.length && simple.count < faithful.count ? [simple] : [])];
  }, [model, deferredSettings, open]);
  const result = manual ? model.describe(manual, settings) : proposals[selectedVariant] || proposals[0];
  const choices = useMemo(() => counterFrom && result?.weights ? model.counterweights(result.weights, counterFrom, settings) : [], [model, result?.weights, counterFrom, settings]);
  const currentIds = Object.keys(base).filter((id) => model.funds[id]);
  const eligible = model.eligible(settings);
  const stepTitles = ['Sur quelle base partir ?', 'Vos convictions. Leur équilibre.', 'Choisissez votre allocation.'];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) {
      if (source === 'current' && (lastInputs.current.weights !== weights || lastInputs.current.lockedIsins !== lockedIsins)) {
        setBase({ ...weights });
        setSettings((old) => ({ ...old, intent: model.intent(weights), equity: 100 - (weights[CASH_ISIN] || 0), locks: Object.fromEntries(lockedIsins.map((id) => [id, weights[id] || 0])), excluded: [] }));
        setManual(null); setSelectedVariant(0); setCounterFrom('');
      }
      lastInputs.current = { weights, lockedIsins };
      if (saveRequested) { setManual({ ...weights }); setStep(2); }
      else if (resume) setStep(1);
      dialog.showModal();
    }
    else if (!open && dialog.open) dialog.close();
  }, [open, weights, lockedIsins, source, model, saveRequested, resume]);
  useEffect(() => { if (open) titleRef.current?.focus(); }, [step, open]);
  function update(patch) {
    setSettings((old) => ({ ...old, ...patch })); setManual(null); setCounterFrom(''); setReplaceFrom(''); setSelectedVariant(0);
  }
  function chooseSource(id) {
    const next = id === 'current' ? weights : id === 'free' ? {} : PRESETS.find((p) => p.id === id)?.weights || models.find((p) => p.id === id)?.weights || {};
    setSource(id); setBase({ ...next });
    update({ intent: model.intent(next), conviction: 100, equity: 100 - (next[CASH_ISIN] || 0), locks: id === 'current' ? Object.fromEntries(lockedIsins.map((key) => [key, weights[key] || 0])) : {}, excluded: [] });
  }
  function saveModel() {
    if (!result?.weights || !modelName.trim()) return;
    const entry = { id: `saved-${Date.now()}`, name: modelName.trim().slice(0, 60), weights: result.weights };
    const next = [entry, ...models].slice(0, 12);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, models: next })); setModels(next); setStorageMessage('Modèle enregistré sur cet appareil.'); }
    catch { setStorageMessage('Enregistrement impossible : le stockage de ce navigateur est indisponible.'); }
  }
  function apply() {
    if (!result?.weights || result.errors?.length || pending) return;
    onApply(result.weights, Object.keys(settings.locks)); setStep(1); onClose();
  }
  function replace() {
    if (!replaceFrom || !replaceTo || !result?.weights) return;
    const nextLocks = { ...settings.locks, [replaceTo]: (result.weights[replaceTo] || 0) + result.weights[replaceFrom] };
    update({ locks: nextLocks, excluded: [...settings.excluded, replaceFrom] });
  }
  function fundRole(id) {
    if (id === CASH_ISIN) return 'Poche court terme · réduire la part exposée aux actions';
    const fund = model.funds[id];
    const sector = Object.entries(fund.sectors).sort((a, b) => b[1] - a[1])[0];
    const zone = Object.entries(fund.zones).sort((a, b) => b[1] - a[1])[0];
    return sector?.[1] >= 50 ? `Conviction sectorielle · ${sector[0]}` : zone?.[1] >= 80 ? `Exposition géographique · ${zone[0]}` : 'Base répartie entre plusieurs zones et secteurs';
  }
  const canApply = result?.weights && !result.errors?.length && !pending;
  return <dialog ref={dialogRef} className="allocation-dialog" aria-labelledby="allocation-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="allocation-header"><div><span className="allocation-kicker">CHAMP LIBRE / CONSTRUCTEUR</span><nav aria-label="Étapes de construction">{['Point de départ', 'Convictions & équilibre', 'Propositions'].map((label, index) => <button type="button" key={label} aria-current={index === step ? 'step' : undefined} disabled={index === 2 && !canApply} onClick={() => setStep(index)}>{index + 1}<span>{label}</span></button>)}</nav></div><button type="button" className="allocation-close" aria-label="Fermer le constructeur" onClick={onClose}>×</button></div>
    <div className="allocation-body"><h2 ref={titleRef} tabIndex={-1} id="allocation-title">{stepTitles[step]}</h2>
    {step === 0 && <><p className="allocation-lead">Partez d’une base, exprimez vos convictions, puis choisissez leurs contrepoids.</p><div className="allocation-starts"><button type="button" className="allocation-choice" aria-pressed={source === 'current'} onClick={() => chooseSource('current')}><span className="allocation-kicker">VOTRE BASE</span><strong>Mon portefeuille actuel</strong><span>{Object.values(weights).filter((w) => w > 0).length} ETF · {percent(total(weights), 0)} alloués</span><small>Reprendre les positions et leurs verrouillages.</small></button>{PRESETS.map((preset) => <button type="button" className="allocation-choice" key={preset.id} aria-pressed={source === preset.id} onClick={() => chooseSource(preset.id)}><span className="allocation-kicker">MODÈLE</span><strong>{preset.name}</strong><span>{preset.description}</span><small>{Object.entries(preset.weights).map(([id, w]) => `${nameOf(model, id)} ${percent(w, 0)}`).join(' · ')}</small></button>)}<button type="button" className="allocation-choice" aria-pressed={source === 'free'} onClick={() => chooseSource('free')}><span className="allocation-kicker">À EXPLORER</span><strong>Allocation libre</strong><span>Définissez vos propres zones et secteurs.</span><small>Les curseurs partent du repère Monde, modifiable.</small></button>{models.map((entry) => <button type="button" className="allocation-choice" key={entry.id} aria-pressed={source === entry.id} onClick={() => chooseSource(entry.id)}><span className="allocation-kicker">ENREGISTRÉ SUR CET APPAREIL</span><strong>{entry.name}</strong><span>{Object.values(entry.weights).filter((w) => w > 0).length} ETF</span></button>)}</div><p className="allocation-note">Ces modèles sont des points de départ exploratoires. Les propositions sont recalculées avec les critères de sélection ; elles peuvent retenir d’autres ETF.</p></>}
    {step === 1 && <><p className="allocation-lead">Chaque renforcement a une contrepartie. Explorez-la avant de modifier votre portefeuille.</p><div className="allocation-workspace"><div className="allocation-controls">
      <div className="allocation-section"><RangeField label="Force de mes convictions" value={settings.conviction} onChange={(conviction) => update({ conviction })} left="Diversification Monde" right="Mes objectifs" description={`${settings.conviction} % de vos objectifs de zones et secteurs, ${100 - settings.conviction} % du repère Monde. Cela règle votre écart à une base mondiale ; le risque ne diminue pas nécessairement.`}/><RangeField label="Part en actions" value={settings.equity} onChange={(equity) => update({ equity })} left="Plus défensif" right="Plus dynamique" description={`${settings.equity} % actions · ${100 - settings.equity} % fonds PEA Euro Court Terme. Ce fonds n’est pas un placement garanti ; sa composition n’est pas assimilée à des actions.`}/></div>
      <details className="allocation-section" open={source === 'free' ? true : undefined}><summary>Personnaliser les zones et les secteurs</summary><p className="allocation-note">Objectifs au sein de la poche actions. Monter un curseur redistribue les autres pour conserver 100 %. Le curseur de conviction les rapproche plus ou moins du Monde.</p><div className="allocation-tabs"><button type="button" aria-pressed={targetKind === 'zones'} onClick={() => setTargetKind('zones')}>Zones</button><button type="button" aria-pressed={targetKind === 'sectors'} onClick={() => setTargetKind('sectors')}>Secteurs</button></div>{(targetKind === 'zones' ? model.zoneNames : model.sectorNames).map((name) => <RangeField key={name} label={name} step={1} value={settings.intent[targetKind][name] || 0} onChange={(value) => update({ intent: { ...settings.intent, [targetKind]: rebalanceTarget(Object.fromEntries((targetKind === 'zones' ? model.zoneNames : model.sectorNames).map((key) => [key, settings.intent[targetKind][key] || 0])), name, value) } })}/>)}</details>
      <details className="allocation-section"><summary>Positions à conserver</summary><p className="allocation-note">Un verrou conserve exactement le poids. Il reste prioritaire sur les filtres de sélection.</p>{[...new Set([...currentIds, ...Object.keys(settings.locks)])].map((id) => <label className="allocation-lock" key={id}><input type="checkbox" checked={settings.locks[id] != null} onChange={() => { const locks = { ...settings.locks }; if (locks[id] != null) delete locks[id]; else locks[id] = base[id] || 0; update({ locks }); }}/><span>{nameOf(model, id)}</span><b>{percent(settings.locks[id] ?? base[id] ?? 0)}</b></label>)}{!currentIds.length && !Object.keys(settings.locks).length && <p className="allocation-note">Aucune position dans ce point de départ.</p>}</details>
      <details className="allocation-section"><summary>Critères de sélection des ETF</summary><div className="allocation-fields"><label>Nombre maximal d’ETF<select value={settings.maxFunds} onChange={(e) => update({ maxFunds: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n}>{n}</option>)}</select></label><label>Frais annuels maximum<select value={settings.maxFee} onChange={(e) => update({ maxFee: e.target.value })}><option value="">Sans plafond</option>{[0.15, 0.25, 0.35, 0.5].map((fee) => <option key={fee} value={fee}>{percent(fee, 2)}</option>)}</select></label><label>Encours minimum du fonds<select value={settings.minSize} onChange={(e) => update({ minSize: Number(e.target.value) })}><option value="0">Sans minimum</option><option value="100000000">100 M€</option><option value="500000000">500 M€</option><option value="1000000000">1 Md€</option></select></label><label>Revenus<select value={settings.distribution} onChange={(e) => update({ distribution: e.target.value })}><option value="">Sans préférence</option><option value="capitalisation">Capitalisation</option><option value="distribution">Distribution</option></select></label><label>Couverture de change<select value={settings.hedging} onChange={(e) => update({ hedging: e.target.value })}><option value="any">Toutes les parts</option><option value="exclude">Exclure les parts explicitement couvertes</option></select></label></div><p className="allocation-note">L’absence de mention de couverture ne prouve pas son absence. Les ETF actions sans composition vérifiée sont exclus de la sélection automatique.</p></details>
      <p className="allocation-note">Les frais et la simplicité départagent les combinaisons proches de la cible. Les encours départagent les équivalents ; ils ne mesurent pas seuls la liquidité.</p>
    </div>{result && <BalancePanel model={model} base={base} result={result} pending={pending}/>}</div></>}
    {step === 2 && result && <><p className="allocation-lead">Comparez les compromis, inspectez les contrepoids, puis appliquez votre choix.</p>{!result.errors?.length ? <><div className="allocation-proposals">{proposals.map((proposal, i) => <button type="button" className="allocation-choice" key={proposal.variant} aria-pressed={!manual && selectedVariant === i} onClick={() => { setSelectedVariant(i); setManual(null); setCounterFrom(''); setReplaceFrom(''); }}><strong>{proposal.variant === 'cost' ? 'Moins de frais' : proposal.variant === 'simple' ? 'Moins d’ETF' : 'Proche de vos objectifs'}</strong><span>{proposal.count} ETF · {percent(proposal.fee, 2)} / an</span><small>Écart maximal à une cible : {points(proposal.maxGap)}</small></button>)}</div>{proposals.length === 1 && <p className="allocation-note">Aucune variante distincte avec moins de frais ou moins d’ETF n’a été trouvée avec ces contraintes.</p>}{manual && <p className="allocation-warning">Allocation personnalisée : les expositions ci-dessous reflètent les poids choisis. <button type="button" onClick={() => setManual(null)}>Revenir à la proposition</button></p>}
      <div className="allocation-workspace"><div><div className="allocation-section"><div className="allocation-kicker">LES RÔLES DANS VOTRE PORTEFEUILLE</div><ul className="allocation-funds">{Object.entries(result.weights).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).map(([id, w]) => <li key={id}><div className="allocation-fund-heading"><strong>{nameOf(model, id)}</strong><b>{percent(w)}</b></div><p>{fundRole(id)}</p><small>{id} · Frais {percent(model.funds[id].fee, 2)} · Encours {sizeLabel(model.funds[id].size)}{model.funds[id].sizeDate && ` au ${model.funds[id].sizeDate}`}</small><small>{model.funds[id].reporting_date ? `Composition au ${model.funds[id].reporting_date}` : 'Pas de composition actions attribuée'}</small>{settings.locks[id] != null ? <span className="allocation-pill">Poids verrouillé</span> : id !== CASH_ISIN && <div className="allocation-inline-actions"><button type="button" onClick={() => { setCounterFrom(counterFrom === id ? '' : id); setReplaceFrom(''); }}>Trouver un contrepoids<span className="allocation-sr-only"> à {nameOf(model, id)}</span></button><button type="button" onClick={() => { setReplaceFrom(id); setReplaceTo(''); setCounterFrom(''); }}>Remplacer<span className="allocation-sr-only"> {nameOf(model, id)}</span></button></div>}</li>)}</ul></div>
      {replaceFrom && <div className="allocation-section"><h3>Remplacer {nameOf(model, replaceFrom)}</h3><label className="allocation-replacement">ETF de remplacement<select value={replaceTo} onChange={(e) => setReplaceTo(e.target.value)}><option value="">Choisir un ETF</option>{eligible.filter((f) => f.isin !== replaceFrom && f.isin !== CASH_ISIN && settings.locks[f.isin] == null).map((f) => <option key={f.isin} value={f.isin}>{f.name} · {percent(f.fee, 2)}</option>)}</select></label><p className="allocation-note">Le poids transféré sera verrouillé sur ce nouvel ETF ; les autres lignes seront recalculées.</p><button type="button" className="allocation-button" disabled={!replaceTo} onClick={replace}>Remplacer et recalculer</button></div>}
      {counterFrom && <div className="allocation-section"><h3>Contrepoids à {nameOf(model, counterFrom)}</h3><p className="allocation-note">Substitutions qui réduisent l’exposition dominante de cet ETF, dans la même poche actions. Les contraintes de frais, de lignes et les verrous sont conservés.</p>{choices.length ? choices.map((choice) => <div className="allocation-counter" key={choice.fund.isin}><strong>{choice.fund.name}</strong><p>Transférer {points(choice.amount)} depuis {nameOf(model, counterFrom)} : {choice.dimension} {points(choice.delta)} dans le portefeuille.</p><RiskComparison model={model} before={result.weights} after={choice.weights}/><button type="button" className="allocation-button" onClick={() => { setManual(choice.weights); setCounterFrom(''); }}>Essayer ce contrepoids</button></div>) : <p className="allocation-warning">Aucun contrepoids de ce type ne respecte les contraintes. Essayez d’autoriser une ligne supplémentaire ou de remplacer entièrement cet ETF.</p>}</div>}
      <div className="allocation-section"><h3>Souhaité et obtenu</h3>{result.maxGap > 3 && <p className="allocation-warning">Certaines cibles s’écartent de plus de 3 points. Vous pouvez autoriser davantage d’ETF, libérer une position ou assouplir vos objectifs.</p>}<ExposureComparison result={result}/></div>
      <details className="allocation-section" open={saveRequested || undefined}><summary>Mémoriser cette allocation comme modèle</summary><div className="allocation-save"><label>Nom du modèle<input maxLength={60} value={modelName} onChange={(e) => { setModelName(e.target.value); setStorageMessage(''); }}/></label><button type="button" className="allocation-button" disabled={!modelName.trim()} onClick={saveModel}>Enregistrer comme modèle</button></div><p role="status" className="allocation-note">{storageMessage || 'Enregistrement local à cet appareil et à ce navigateur.'}</p></details>
      <details className="allocation-section"><summary>Comment cette proposition est calculée</summary><p className="allocation-note">Recherche déterministe par transferts de poids, au dixième de point. Le moteur rapproche les zones et secteurs de vos cibles, avec une préférence pour les frais faibles. Il ne garantit pas l’optimum mathématique. Les filtres et les poids verrouillés sont des contraintes ; les objectifs d’exposition restent approchés. Les frais affichés excluent courtage et spread. La composition est un instantané, pas une reconstitution historique. Aucun rendement passé n’est maximisé.</p></details>
      </div><BalancePanel model={model} base={base} result={result} pending={pending}/></div></> : <div role="alert" className="allocation-warning">{result.errors.map((error) => <p key={error}>{error}</p>)}</div>}</>}
    </div>
    <footer className="allocation-footer"><button type="button" className="allocation-button" onClick={() => step ? setStep(step - 1) : onClose()}>{step ? '← Retour' : 'Fermer'}</button><span>Votre portefeuille change uniquement à l’application.</span>{step < 2 ? <button type="button" className="allocation-button allocation-primary" disabled={step === 1 && !canApply} onClick={() => setStep(step + 1)}>{step === 0 ? 'Ajuster mes objectifs →' : 'Voir les allocations →'}</button> : <button type="button" className="allocation-button allocation-primary" disabled={!canApply} onClick={apply}>Appliquer au portefeuille virtuel</button>}</footer>
  </dialog>;
}
