import { useEffect, useRef, useState } from 'react';
import { request } from './bridge.js';
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
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState({ patrimoine: null, schedule: null, credit: null });
  const [pending, setPending] = useState(null);
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
      const last = editorRef.current?.querySelector('tbody tr:last-child');
      last?.querySelector(`[data-field="${focusField}"]`)?.focus();
    }, 0);
  }
  function resetRow(row) {
    const original = savedByKey.get(row.key);
    setRows((previous) => original
      ? previous.map((entry) => entry.key === row.key ? { ...original } : entry)
      : previous.filter((entry) => entry.key !== row.key));
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
  async function preview(event) {
    event.preventDefault(); setMessage(''); setPending(null);
    try {
      if (!files.patrimoine) throw new Error('Choisissez le CSV patrimoine.');
      const payload = { patrimoine_csv: await files.patrimoine.text(), amortissement_csv: files.schedule ? await files.schedule.text() : '', credit_json: files.credit ? await files.credit.text() : '' };
      const report = await json('/api/legacy-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setPending({ payload, report });
    } catch (error) {
      setMessage(error.message.startsWith('La dette liée exige')
        ? 'Ce patrimoine contient une dette liée. Sélectionnez aussi amortissement.csv et credit.json, puis cliquez de nouveau sur Prévisualiser.'
        : error.message);
    }
  }
  async function commitImport() {
    setMessage('');
    try {
      if (dirty) throw new Error('Enregistrez ou annulez les modifications du tableau avant l’import.');
      await json('/api/legacy-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pending.payload) });
      setPending(null); await refresh();
      setMessage('Import terminé. Vérifiez les totaux et classez les postes encore inconnus.');
    } catch (error) { setMessage(error.message); }
  }

  return <main className="local-page household-page">
    <header><span className="local-eyebrow">VUE D’ENSEMBLE</span><h1>Patrimoine du foyer</h1><p>Les valorisations et les vérifications ont chacune leur date. Les échéances passées sont supposées payées.</p></header>
    {message && <p role="status" className="local-notice">{message}</p>}
    {!data && <p className="local-empty">Chargement des données locales…</p>}
    {data && <>
      <div className="local-metrics"><article><span>Patrimoine net</span><strong>{euro(current.net_eur)}</strong></article><article><span>Avoirs actuels du foyer</span><strong>{euro(current.assets_eur)}</strong></article><article><span>Dettes actuelles du foyer</span><strong>{euro(current.debts_eur)}</strong></article></div>
      <label className="local-date">Voir à la date <select value={selectedDay} onChange={(event) => selectDay(event.target.value)}>{data.dates.map((date) => <option key={date} value={date}>{date}</option>)}{!data.dates.length && <option value={current.day}>{current.day}</option>}</select></label>
      <details className="household-guide"><summary>Aide-mémoire : ai-je pensé à tous les postes utiles ?</summary><div><p>Parcourez ces familles pour repérer un oubli. Saisissez ce qui existe et change réellement votre vue du patrimoine.</p><ul><li><strong>Argent accessible :</strong> comptes courants, livrets et espèces significatives.</li><li><strong>Placements :</strong> PEA, assurance-vie, épargne salariale et retraite. Séparez espèces et titres.</li><li><strong>Immobilier :</strong> résidence principale, locatif et autres droits valorisables.</li><li><strong>Dettes :</strong> capital restant dû des prêts et autres soldes dus.</li><li><strong>À part :</strong> avoirs des enfants et héritages attendus, avec les statuts adaptés.</li></ul><p>Un bien et son crédit sont deux lignes. Une dette liée à un échéancier prend sa valeur dans le tableau bancaire. Les avoirs des enfants et le prévisionnel sont exclus des totaux actuels.</p></div></details>
      <form className="household-editor" onSubmit={saveAll} ref={editorRef}>
        <div className="household-toolbar"><div className="household-view-name"><span aria-hidden="true">▦</span> Tous les postes <span className="household-count">{rows.length}</span></div><div className="household-actions"><button type="button" className="household-secondary" disabled={!dirty || saving} onClick={() => { setRows(savedRows.map((row) => ({ ...row }))); setMessage('Modifications annulées.'); }}>Annuler</button><button type="submit" disabled={!dirty || saving}>{saving ? 'Enregistrement…' : `Enregistrer${dirty ? ` (${changed.length})` : ''}`}</button></div></div>
        <p className="household-meta"><span className={`household-dot${dirty ? ' dirty' : ''}`} aria-hidden="true"/>{dirty ? 'Modifications non enregistrées' : 'Modifiez les cellules directement, puis enregistrez.'} <span>·</span> SQLite locale</p>
        <div className="local-table-wrap household-table-wrap" role="region" tabIndex="0" aria-label="Tableau de saisie du patrimoine">
          <table><thead><tr><th>Date du relevé</th><th>Type</th><th>Catégorie</th><th>Compte ou bien</th><th>Valeur</th><th>Échéancier</th><th>Propriété</th><th>Statut</th><th>Usage</th><th>Actif détenu</th><th>Enveloppe</th><th>Vérifié le</th><th></th></tr></thead><tbody>
            {!rows.length && <tr><td colSpan="13" className="household-empty">Aucun poste. Ajoutez une ligne ou importez l’ancien Patrimoine.</td></tr>}
            {rows.map((row) => row.managedPea
              ? <tr key={row.key} className="household-managed"><td>{row.day}</td><td>{labelOf('kind', row.kind)}</td><td>{row.category}</td><td>{row.label}</td><td className="household-number">{euro(row.displayValue)}</td><td>—</td><td>{labelOf('owner', row.owner)}</td><td>{labelOf('status', row.status)}</td><td>{labelOf('usage', row.usage)}</td><td>{labelOf('asset_class', row.asset_class)}</td><td>PEA</td><td>{row.verified_on}</td><td><button type="button" className="household-secondary" onClick={openPea}>Mon PEA</button></td></tr>
              : <tr key={row.key} data-row-key={row.key} className={row.status === 'previsionnel' || row.owner === 'enfants' ? 'local-excluded' : undefined} onKeyDown={(event) => nextCell(event, row, event.target.dataset.field)}>
                <td><input data-field="day" aria-label="Date du relevé" type="date" required value={row.day} onChange={(event) => change(row.key, 'day', event.target.value)}/></td>
                <td><Choice row={row} field="kind" change={change}/></td>
                <td><input data-field="category" aria-label="Catégorie" list="household-categories" required maxLength="80" placeholder="Catégorie" value={row.category} onChange={(event) => change(row.key, 'category', event.target.value)}/></td>
                <td><input data-field="label" aria-label="Compte ou bien" required maxLength="80" placeholder="Nom du poste" value={row.label} onChange={(event) => change(row.key, 'label', event.target.value)}/></td>
                <td><input data-field="value_eur" aria-label="Valeur en euros" type="number" min="0" step="0.01" required={!row.schedule_id} disabled={!!row.schedule_id} placeholder={row.schedule_id ? 'Calculé' : '0,00'} value={row.value_eur} onChange={(event) => change(row.key, 'value_eur', event.target.value)}/>{row.schedule_id && <small>{euro(row.displayValue)}</small>}</td>
                <td><select data-field="schedule_id" aria-label="Échéancier" value={row.schedule_id} disabled={row.kind !== 'passif'} onChange={(event) => change(row.key, 'schedule_id', event.target.value)}><option value="">Aucun · valeur manuelle</option>{data.schedules.map((schedule) => <option key={schedule.id} value={schedule.id}>{schedule.label}</option>)}</select></td>
                <td><Choice row={row} field="owner" change={change}/></td>
                <td><Choice row={row} field="status" change={change}/></td>
                <td><Choice row={row} field="usage" change={change}/></td>
                <td><Choice row={row} field="asset_class" change={change}/></td>
                <td><select data-field="account_id" aria-label="Compte ou enveloppe" value={row.account_id} onChange={(event) => change(row.key, 'account_id', event.target.value)}><option value="">Non précisé</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.label} · {account.envelope}</option>)}</select></td>
                <td><input data-field="verified_on" aria-label="Vérifié le" type="date" required value={row.verified_on} onChange={(event) => change(row.key, 'verified_on', event.target.value)}/></td>
                <td><button type="button" className="household-row-reset" onClick={() => resetRow(row)} disabled={!!savedByKey.get(row.key) && same(row, savedByKey.get(row.key))} title={savedByKey.has(row.key) ? 'Annuler les changements de cette ligne' : 'Retirer cette nouvelle ligne'} aria-label={savedByKey.has(row.key) ? `Annuler les changements de ${row.label}` : 'Retirer cette nouvelle ligne'}>{savedByKey.has(row.key) ? '↶' : '×'}</button></td>
              </tr>)}
          </tbody></table>
          <datalist id="household-categories">{categories.map((category) => <option key={category} value={category}/>)}</datalist>
          <button type="button" className="household-add-row" onClick={() => addRow()}>＋ Nouvelle ligne</button>
        </div>
        <p className="household-footnote">Les lignes « Enfants / hors foyer » et « Prévisionnel » restent visibles, mais hors des totaux actuels. Changer une catégorie ou une propriété conserve l’identifiant et l’historique du poste.</p>
      </form>
      {!!data.history.length && <details className="household-details"><summary>Historique du patrimoine net</summary><p>Écart de valorisation entre relevés ; aucun gain ni flux n’est déduit.</p><ul>{data.history.map((point) => <li key={point.day}>{point.day} — {euro(point.net_eur)}</li>)}</ul></details>}
      {!!data.schedules.length && <details className="household-details"><summary>Crédits liés</summary>{data.schedules.map((schedule) => <p key={schedule.id}><strong>{schedule.label}</strong> · {schedule.rows} échéances · dernière date {schedule.last_due} · reliquat final {euro(schedule.final_balance_eur)}. Source : {schedule.metadata.source || 'non précisée'}.</p>)}</details>}
      <section className="local-panel household-import"><h2>Importer l’ancien Patrimoine</h2><p>Choisissez les fichiers d’origine sur cet ordinateur. Ils restent intacts. L’import crée des identifiants stables ; les postes contenant « PEA » seront proposés au rapprochement, sans fusion automatique.</p><p>Si le patrimoine contient une dette liée, sélectionnez aussi <strong>amortissement.csv</strong> et <strong>credit.json</strong> avant de prévisualiser. Les trois fichiers se trouvent dans l’ancien dossier Patrimoine.</p><form onSubmit={preview} className="local-form"><label>Patrimoine CSV<input type="file" accept=".csv,text/csv" onChange={(event) => setFiles({ ...files, patrimoine: event.target.files?.[0] })}/></label><label>Échéancier CSV, si dette liée<input type="file" accept=".csv,text/csv" onChange={(event) => setFiles({ ...files, schedule: event.target.files?.[0] })}/></label><label>Métadonnées crédit JSON<input type="file" accept=".json,application/json" onChange={(event) => setFiles({ ...files, credit: event.target.files?.[0] })}/></label><button type="submit">Prévisualiser</button></form>{pending && <div className="local-preview"><p>{pending.report.lines} lignes · {pending.report.items} postes · {pending.report.schedule_rows} échéances · {pending.report.same_day_overwrites} écrasement(s) de même date.</p><p>Candidats PEA à examiner : {pending.report.pea_candidates.join(', ') || 'aucun'}.</p><button type="button" onClick={commitImport}>Confirmer l’import dans cette base vierge</button></div>}</section>
    </>}
  </main>;
}
