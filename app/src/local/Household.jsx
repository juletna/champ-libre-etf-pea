import { Fragment, useEffect, useRef, useState } from 'react';
import { request } from './bridge.js';
import { CreditSchedules, HouseholdVisuals } from './HouseholdVisuals.jsx';
import './local.css';

const today = () => new Date().toLocaleDateString('en-CA');
const euro = (value) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value || 0);
const choices = {
  kind: [['actif', 'Avoir'], ['passif', 'Dette']],
  owner: [['non_precise', 'Non précisée'], ['commun', 'Commun'], ['conjoint_1', 'Conjoint 1'], ['conjoint_2', 'Conjoint 2'], ['enfants', 'Enfants / hors foyer']],
  status: [['actuel', 'Actuel'], ['previsionnel', 'Prévisionnel']],
  usage: [['libre', 'Libre'], ['reserve', 'Réservé'], ['urgence', 'Réservé · urgence']],
  asset_class: [['inconnu', 'À préciser'], ['liquidite', 'Liquidités'], ['immobilier', 'Immobilier'], ['titre', 'Titres'], ['autre', 'Autre actif']],
};
const defaultCategories = ['Liquidités', 'Placements', 'Immobilier', 'Autres actifs', 'Crédit immobilier', 'Autres dettes'];
const fieldLabels = { kind: 'Type', owner: 'Propriété', status: 'Statut', usage: 'Usage', asset_class: 'Actif détenu' };
const fields = ['id', 'day', 'kind', 'category', 'label', 'value_eur', 'schedule_id', 'owner', 'status', 'usage', 'asset_class', 'account_id', 'verified_on'];

async function json(path, options) { return (await request(path, options)).json(); }
const labelOf = (name, value) => choices[name]?.find(([code]) => code === value)?.[1] || value || '—';
const stored = (row) => Object.fromEntries(fields.flatMap((name) => name === 'id' && !row.id ? [] : [[name, row[name] ?? '']]));
const same = (left, right) => JSON.stringify(stored(left)) === JSON.stringify(stored(right));
const draftFrom = (item) => ({
  key: item.id, id: item.id, day: item.day, kind: item.kind, category: item.category, label: item.label,
  value_eur: item.schedule_id ? '' : String(item.value_eur ?? ''), displayValue: item.value_eur,
  schedule_id: item.schedule_id || '', owner: item.owner, status: item.status, usage: item.usage,
  asset_class: item.asset_class, account_id: item.account_id || '', verified_on: item.verified_on,
  managedPea: item.id === 'pea' || item.source === 'relevé PEA détaillé',
});
function newDraft(day) {
  const id = crypto.randomUUID();
  return { key: id, id, day, kind: 'actif', category: '', label: '', value_eur: '',
    schedule_id: '', owner: 'non_precise', status: 'actuel', usage: 'libre', asset_class: 'inconnu',
    account_id: '', verified_on: today(), managedPea: false };
}

function Choice({ row, field, change, disabled = false }) {
  return <select data-field={field} aria-label={fieldLabels[field]} value={row[field]} disabled={disabled} onChange={(event) => change(row.key, field, event.target.value)}>
    {choices[field].map(([code, label]) => <option key={code} value={code}>{label}</option>)}
  </select>;
}

export default function Household({ openPea }) {
  const [data, setData] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [selectedDay, setSelectedDay] = useState('');
  const [rows, setRows] = useState([]);
  const [savedRows, setSavedRows] = useState([]);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const editorRef = useRef(null);
  const current = data?.snapshot;
  const savedByKey = new Map(savedRows.map((row) => [row.key, row]));
  const changed = rows.filter((row) => !row.managedPea && (!savedByKey.has(row.key) || !same(row, savedByKey.get(row.key))));
  const dirty = changed.length > 0;
  const categories = [...new Set([...defaultCategories, ...rows.map((row) => row.category).filter(Boolean)])];

  async function refresh(day = '') {
    const [result, budget] = await Promise.all([json(`/api/household${day ? `?day=${encodeURIComponent(day)}` : ''}`), json('/api/budget')]);
    const loaded = result.snapshot.items.map(draftFrom);
    setData(result);
    setAccounts(budget.accounts);
    setSelectedDay(result.snapshot.day);
    setRows(loaded);
    setSavedRows(loaded.map((row) => ({ ...row })));
    setExpandedRows(new Set());
  }
  useEffect(() => { refresh().catch((error) => setMessage(error.message)); }, []);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function change(key, field, value) {
    setRows((previous) => previous.map((row) => {
      if (row.key !== key) return row;
      const next = { ...row, [field]: value };
      if (field === 'kind' && value !== 'passif') next.schedule_id = '';
      if (field === 'schedule_id') next.value_eur = '';
      if (field === 'value_eur') next.verified_on = today();
      return next;
    }));
  }
  function addRow(focusField = 'category') {
    const row = newDraft(selectedDay || today());
    setRows((previous) => [...previous, row]);
    setTimeout(() => {
      const last = [...(editorRef.current?.querySelectorAll('tbody tr[data-row-key]') || [])].at(-1);
      last?.querySelector(`[data-field="${focusField}"]`)?.focus();
    }, 0);
  }
  function resetRow(row) {
    const original = savedByKey.get(row.key);
    setRows((previous) => original
      ? previous.map((entry) => entry.key === row.key ? { ...original } : entry)
      : previous.filter((entry) => entry.key !== row.key));
  }
  function toggleDetails(key) {
    setExpandedRows((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function nextCell(event, row, field) {
    if (!field || event.key !== 'Enter' || event.target.tagName === 'SELECT') return;
    event.preventDefault();
    const all = [...(editorRef.current?.querySelectorAll('tbody tr[data-row-key]') || [])];
    const index = all.findIndex((element) => element.dataset.rowKey === row.key);
    const next = all.slice(index + 1).find((element) => element.querySelector(`[data-field="${field}"]:not(:disabled)`));
    if (next) next.querySelector(`[data-field="${field}"]`)?.focus();
    else addRow(field);
  }
  async function saveAll(event) {
    event.preventDefault();
    if (!dirty || saving) return;
    setMessage(''); setSaving(true);
    let committed = false;
    try {
      await json('/api/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: changed.map(stored) }) });
      committed = true;
      await refresh(selectedDay);
      setMessage(`${changed.length} poste${changed.length > 1 ? 's' : ''} enregistré${changed.length > 1 ? 's' : ''}. L’historique et les valorisations inchangées sont conservés.`);
    } catch (error) {
      setMessage(committed ? 'Enregistrement effectué, mais l’affichage n’a pas pu être actualisé. Rechargez la page.'
        : error.message === 'API inconnue.' ? 'Le serveur local utilise l’ancienne version. Fermez sa fenêtre Terminal, puis relancez Champ libre.command.'
          : error.message);
    }
    finally { setSaving(false); }
  }
  async function selectDay(day) {
    if (dirty && !window.confirm('Abandonner les modifications non enregistrées pour changer de date ?')) return;
    try { await refresh(day); setMessage(''); } catch (error) { setMessage(error.message); }
  }
  return <main className="local-page household-page">
    <header><span className="local-eyebrow">VUE D’ENSEMBLE</span><h1>Patrimoine du foyer</h1><p>Les valorisations et les vérifications ont chacune leur date. Les échéances passées sont supposées payées.</p></header>
    {message && <p role="status" className="local-notice">{message}</p>}
    {!data && <p className="local-empty">Chargement des données locales…</p>}
    {data && <>
      <div className="local-metrics"><article><span>Patrimoine net</span><strong>{euro(current.net_eur)}</strong></article><article><span>Avoirs actuels du foyer</span><strong>{euro(current.assets_eur)}</strong></article><article><span>Dettes actuelles du foyer</span><strong>{euro(current.debts_eur)}</strong></article></div>
      <label className="local-date">Voir à la date <select value={selectedDay} onChange={(event) => selectDay(event.target.value)}>{data.dates.map((date) => <option key={date} value={date}>{date}</option>)}{!data.dates.length && <option value={current.day}>{current.day}</option>}</select></label>
      <HouseholdVisuals snapshot={current} history={data.history}/>
      <CreditSchedules schedules={data.schedules} selectedDay={selectedDay}/>
      <details className="household-guide"><summary>Aide-mémoire : ai-je pensé à tous les postes utiles ?</summary><div><p>Parcourez ces familles pour repérer un oubli. Saisissez ce qui existe et change réellement votre vue du patrimoine.</p><ul><li><strong>Argent accessible :</strong> comptes courants, livrets et espèces significatives.</li><li><strong>Placements :</strong> PEA, assurance-vie, épargne salariale et retraite. Séparez espèces et titres.</li><li><strong>Immobilier :</strong> résidence principale, locatif et autres droits valorisables.</li><li><strong>Dettes :</strong> capital restant dû des prêts et autres soldes dus.</li><li><strong>À part :</strong> avoirs des enfants et héritages attendus, avec les statuts adaptés.</li></ul><p>Un bien et son crédit sont deux lignes. Une dette liée à un échéancier prend sa valeur dans le tableau bancaire. Les avoirs des enfants et le prévisionnel sont exclus des totaux actuels.</p></div></details>
      <form className="household-editor" onSubmit={saveAll} ref={editorRef}>
        <div className="household-toolbar"><div className="household-view-name"><span aria-hidden="true">▦</span> Tous les postes <span className="household-count">{rows.length}</span></div><div className="household-actions"><button type="button" className="household-secondary" disabled={!dirty || saving} onClick={() => { setRows(savedRows.map((row) => ({ ...row }))); setMessage('Modifications annulées.'); }}>Annuler</button><button type="submit" disabled={!dirty || saving}>{saving ? 'Enregistrement…' : `Enregistrer${dirty ? ` (${changed.length})` : ''}`}</button></div></div>
        <p className="household-meta"><span className={`household-dot${dirty ? ' dirty' : ''}`} aria-hidden="true"/>{dirty ? 'Modifications non enregistrées' : 'Modifiez les cellules directement, puis enregistrez.'} <span>·</span> SQLite locale</p>
        <div className="local-table-wrap household-table-wrap" role="region" aria-label="Tableau de saisie du patrimoine">
          <table><thead><tr><th>Date du relevé</th><th>Type</th><th>Catégorie</th><th>Compte ou bien</th><th>Valeur</th><th>Propriété</th><th>Vérifié le</th><th>Actions</th></tr></thead><tbody>
            {!rows.length && <tr><td colSpan="8" className="household-empty">Aucun poste. Ajoutez votre première ligne.</td></tr>}
            {rows.map((row) => row.managedPea
              ? <tr key={row.key} className="household-managed"><td data-label="Date du relevé">{row.day}</td><td data-label="Type">{labelOf('kind', row.kind)}</td><td data-label="Catégorie">{row.category}</td><td data-label="Compte ou bien">{row.label}</td><td data-label="Valeur" className="household-number">{euro(row.displayValue)}</td><td data-label="Propriété">{labelOf('owner', row.owner)}</td><td data-label="Vérifié le">{row.verified_on}</td><td data-label="Actions"><button type="button" className="household-secondary" onClick={openPea}>Mon PEA</button></td></tr>
              : <Fragment key={row.key}>
                <tr data-row-key={row.key} className={row.status === 'previsionnel' || row.owner === 'enfants' ? 'local-excluded' : undefined} onKeyDown={(event) => nextCell(event, row, event.target.dataset.field)}>
                  <td data-label="Date du relevé"><input data-field="day" aria-label="Date du relevé" type="date" required value={row.day} onChange={(event) => change(row.key, 'day', event.target.value)}/></td>
                  <td data-label="Type"><Choice row={row} field="kind" change={change}/></td>
                  <td data-label="Catégorie"><input data-field="category" aria-label="Catégorie" list="household-categories" required maxLength="80" placeholder="Catégorie" value={row.category} onChange={(event) => change(row.key, 'category', event.target.value)}/></td>
                  <td data-label="Compte ou bien"><input data-field="label" aria-label="Compte ou bien" required maxLength="80" placeholder="Nom du poste" value={row.label} onChange={(event) => change(row.key, 'label', event.target.value)}/>{row.status === 'previsionnel' && <small>Prévisionnel · hors totaux</small>}{row.owner === 'enfants' && <small>Enfants · hors totaux</small>}</td>
                  <td data-label="Valeur"><input data-field="value_eur" aria-label="Valeur en euros" type="number" min="0" step="0.01" required={!row.schedule_id} disabled={!!row.schedule_id} placeholder={row.schedule_id ? 'Calculé' : '0,00'} value={row.value_eur} onChange={(event) => change(row.key, 'value_eur', event.target.value)}/>{row.schedule_id && <small>{euro(row.displayValue)}</small>}</td>
                  <td data-label="Propriété"><Choice row={row} field="owner" change={change}/></td>
                  <td data-label="Vérifié le"><input data-field="verified_on" aria-label="Vérifié le" type="date" required value={row.verified_on} onChange={(event) => change(row.key, 'verified_on', event.target.value)}/></td>
                  <td data-label="Actions" className="household-row-actions"><button type="button" className="household-more" aria-expanded={expandedRows.has(row.key)} aria-label={`${expandedRows.has(row.key) ? 'Masquer' : 'Afficher'} les autres champs de ${row.label || 'cette ligne'}`} onClick={() => toggleDetails(row.key)}>{expandedRows.has(row.key) ? '−' : '＋'} Champs</button><button type="button" className="household-row-reset" onClick={() => resetRow(row)} disabled={!!savedByKey.get(row.key) && same(row, savedByKey.get(row.key))} title={savedByKey.has(row.key) ? 'Annuler les changements de cette ligne' : 'Retirer cette nouvelle ligne'} aria-label={savedByKey.has(row.key) ? `Annuler les changements de ${row.label}` : 'Retirer cette nouvelle ligne'}>{savedByKey.has(row.key) ? '↶' : '×'}</button></td>
                </tr>
                {expandedRows.has(row.key) && <tr className="household-extra-row"><td colSpan="8"><div className="household-extra-grid">
                  <label>Échéancier<select data-field="schedule_id" aria-label="Échéancier" value={row.schedule_id} disabled={row.kind !== 'passif'} onChange={(event) => change(row.key, 'schedule_id', event.target.value)}><option value="">Aucun · valeur manuelle</option>{data.schedules.map((schedule) => <option key={schedule.id} value={schedule.id}>{schedule.label}</option>)}</select></label>
                  <label>Statut<Choice row={row} field="status" change={change}/></label>
                  <label>Usage<Choice row={row} field="usage" change={change}/></label>
                  <label>Actif détenu<Choice row={row} field="asset_class" change={change}/></label>
                  <label>Compte ou enveloppe<select data-field="account_id" aria-label="Compte ou enveloppe" value={row.account_id} onChange={(event) => change(row.key, 'account_id', event.target.value)}><option value="">Non précisé</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.label} · {account.envelope}</option>)}</select></label>
                </div></td></tr>}
              </Fragment>)}
          </tbody></table>
          <datalist id="household-categories">{categories.map((category) => <option key={category} value={category}/>)}</datalist>
          <button type="button" className="household-add-row" onClick={() => addRow()}>＋ Nouvelle ligne</button>
        </div>
        <p className="household-footnote">Les lignes « Enfants / hors foyer » et « Prévisionnel » restent visibles, mais hors des totaux actuels. Changer une catégorie ou une propriété conserve l’identifiant et l’historique du poste.</p>
      </form>
    </>}
  </main>;
}
