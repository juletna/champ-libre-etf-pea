import { useEffect, useState } from 'react';
import { request } from './bridge.js';
import './local.css';

const today = () => new Date().toLocaleDateString('en-CA');
const euro = (value) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value || 0);
const empty = () => ({ day: today(), kind: 'actif', category: '', label: '', value_eur: '', verified_on: today(), owner: 'non_precise', status: 'actuel', usage: 'libre', asset_class: 'inconnu', schedule_id: '' });
const choices = {
  kind: [['actif', 'Avoir'], ['passif', 'Dette']],
  owner: [['non_precise', 'Non précisée'], ['commun', 'Commun'], ['conjoint_1', 'Conjoint 1'], ['conjoint_2', 'Conjoint 2'], ['enfants', 'Enfants / hors foyer']],
  status: [['actuel', 'Actuel'], ['previsionnel', 'Prévisionnel']],
  usage: [['libre', 'Libre'], ['reserve', 'Réservé'], ['urgence', 'Réserve d’urgence']],
  asset_class: [['inconnu', 'À préciser'], ['liquidite', 'Liquidités'], ['immobilier', 'Immobilier'], ['titre', 'Titre'], ['autre', 'Autre actif']],
};

async function json(path, options) { return (await request(path, options)).json(); }

function Select({ name, label, value, update }) {
  return <label>{label}<select value={value} onChange={(event) => update(name, event.target.value)}>{choices[name].map(([code, title]) => <option key={code} value={code}>{title}</option>)}</select></label>;
}

export default function Household({ openPea }) {
  const [data, setData] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [selectedDay, setSelectedDay] = useState('');
  const [form, setForm] = useState(empty);
  const [files, setFiles] = useState({ patrimoine: null, schedule: null, credit: null });
  const [pending, setPending] = useState(null);
  const [message, setMessage] = useState('');
  async function refresh(day = '') {
    const [result, budget] = await Promise.all([json(`/api/household${day ? `?day=${encodeURIComponent(day)}` : ''}`), json('/api/budget')]);
    setData(result);
    setAccounts(budget.accounts);
    setSelectedDay(result.snapshot.day);
  }
  useEffect(() => { refresh().catch((error) => setMessage(error.message)); }, []);
  function update(name, value) { setForm((current) => ({ ...current, [name]: value })); }
  function edit(item) { setForm({ ...item, value_eur: item.schedule_id ? '' : item.value_eur, day: item.day, schedule_id: item.schedule_id || '' }); }
  async function save(event) {
    event.preventDefault(); setMessage('');
    try {
      await json('/api/item', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      await refresh(selectedDay);
      setForm(empty());
      setMessage('Poste enregistré avec son identifiant stable.');
    } catch (error) { setMessage(error.message); }
  }
  async function preview(event) {
    event.preventDefault(); setMessage(''); setPending(null);
    try {
      if (!files.patrimoine) throw new Error('Choisissez le CSV patrimoine.');
      const payload = { patrimoine_csv: await files.patrimoine.text(), amortissement_csv: files.schedule ? await files.schedule.text() : '', credit_json: files.credit ? await files.credit.text() : '' };
      const report = await json('/api/legacy-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setPending({ payload, report });
    } catch (error) { setMessage(error.message); }
  }
  async function commitImport() {
    setMessage('');
    try {
      await json('/api/legacy-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pending.payload) });
      setPending(null); await refresh();
      setMessage('Import terminé. Vérifiez les totaux et classez les postes encore inconnus.');
    } catch (error) { setMessage(error.message); }
  }
  const current = data?.snapshot;
  return <main className="local-page">
    <header><span className="local-eyebrow">VUE D’ENSEMBLE</span><h1>Patrimoine du foyer</h1><p>Les valorisations et les vérifications ont chacune leur date. Les échéances passées sont supposées payées.</p></header>
    {message && <p role="status" className="local-notice">{message}</p>}
    {!data && <p>Chargement des données locales…</p>}
    {data && <>
      <div className="local-metrics"><article><span>Patrimoine net</span><strong>{euro(current.net_eur)}</strong></article><article><span>Avoirs actuels du foyer</span><strong>{euro(current.assets_eur)}</strong></article><article><span>Dettes actuelles du foyer</span><strong>{euro(current.debts_eur)}</strong></article></div>
      <label className="local-date">Voir à la date <select value={selectedDay} onChange={async (event) => { const next = event.target.value; try { await refresh(next); } catch (error) { setMessage(error.message); } }}>{data.dates.map((date) => <option key={date} value={date}>{date}</option>)}{!data.dates.length && <option value={current.day}>{current.day}</option>}</select></label>
      {!current.items.length && <p className="local-empty">Aucun poste. Importez l’ancien CSV ou créez un premier avoir et une dette.</p>}
      {!!current.items.length && <div className="local-table-wrap" role="region" tabIndex="0" aria-label="Postes du patrimoine"><table><thead><tr><th>Poste</th><th>Catégorie</th><th>Propriété</th><th>Usage</th><th>Valorisation</th><th>Vérifié le</th><th></th></tr></thead><tbody>{current.items.map((item) => <tr key={item.id} className={item.status === 'previsionnel' || item.owner === 'enfants' ? 'local-excluded' : ''}><th>{item.label}<small>{item.kind === 'passif' ? 'Dette' : 'Avoir'} · {item.asset_class}{item.status === 'previsionnel' ? ' · Prévisionnel' : ''}</small></th><td>{item.category}</td><td>{choices.owner.find(([code]) => code === item.owner)?.[1]}</td><td>{choices.usage.find(([code]) => code === item.usage)?.[1]}</td><td>{euro(item.value_eur)}{item.schedule_id && <small>Échéancier · {item.last_due || 'avant 1re échéance'}</small>}</td><td>{item.verified_on}</td><td>{item.id === 'pea' ? <button type="button" onClick={openPea}>Mon PEA</button> : <button type="button" onClick={() => edit(item)}>Modifier</button>}</td></tr>)}</tbody></table></div>}
      {!!data.history.length && <details><summary>Historique du patrimoine net</summary><p>Écart de valorisation entre relevés ; aucun gain ni flux n’est déduit.</p><ul>{data.history.map((point) => <li key={point.day}>{point.day} — {euro(point.net_eur)}</li>)}</ul></details>}
      {!!data.schedules.length && <details><summary>Crédits liés</summary>{data.schedules.map((schedule) => <p key={schedule.id}><strong>{schedule.label}</strong> · {schedule.rows} échéances · dernière date {schedule.last_due} · reliquat final {euro(schedule.final_balance_eur)}. Source : {schedule.metadata.source || 'non précisée'}.</p>)}</details>}
      <section className="local-panel"><h2>{form.id ? 'Modifier ce poste' : 'Ajouter un poste'}</h2><p>La valeur saisie crée ou actualise un relevé daté. Modifier son nom conserve l’identifiant et son historique.</p><form onSubmit={save} className="local-form"><label>Date du relevé<input type="date" required value={form.day} onChange={(event) => update('day', event.target.value)}/></label><Select name="kind" label="Type" value={form.kind} update={update}/><label>Catégorie<input required maxLength="80" value={form.category} onChange={(event) => update('category', event.target.value)}/></label><label>Poste<input required maxLength="80" value={form.label} onChange={(event) => update('label', event.target.value)}/></label><Select name="owner" label="Propriété" value={form.owner} update={update}/><Select name="status" label="Statut" value={form.status} update={update}/><Select name="usage" label="Usage" value={form.usage} update={update}/><Select name="asset_class" label="Actif détenu" value={form.asset_class} update={update}/><label>Compte ou enveloppe<select value={form.account_id || ''} onChange={(event) => update('account_id', event.target.value)}><option value="">Non précisé</option>{accounts.map((entry) => <option key={entry.id} value={entry.id}>{entry.label} · {entry.envelope}</option>)}</select></label><label>Échéancier<select value={form.schedule_id || ''} onChange={(event) => update('schedule_id', event.target.value)}><option value="">Aucun</option>{data.schedules.map((schedule) => <option key={schedule.id} value={schedule.id}>{schedule.label}</option>)}</select></label><label>Valeur (€)<input type="number" min="0" step="0.01" disabled={!!form.schedule_id} required={!form.schedule_id} value={form.value_eur ?? ''} onChange={(event) => update('value_eur', event.target.value)}/></label><label>Vérifié le<input type="date" required value={form.verified_on} onChange={(event) => update('verified_on', event.target.value)}/></label><div className="local-form-actions"><button type="submit">Enregistrer</button>{form.id && <button type="button" onClick={() => setForm(empty())}>Nouveau poste</button>}</div></form></section>
      <section className="local-panel"><h2>Importer l’ancien Patrimoine</h2><p>Choisissez les fichiers d’origine sur cet ordinateur. Ils restent intacts. L’import crée des identifiants stables ; les postes contenant « PEA » seront proposés au rapprochement, sans fusion automatique.</p><form onSubmit={preview} className="local-form"><label>Patrimoine CSV<input type="file" accept=".csv,text/csv" onChange={(event) => setFiles({ ...files, patrimoine: event.target.files?.[0] })}/></label><label>Échéancier CSV, si dette liée<input type="file" accept=".csv,text/csv" onChange={(event) => setFiles({ ...files, schedule: event.target.files?.[0] })}/></label><label>Métadonnées crédit JSON<input type="file" accept=".json,application/json" onChange={(event) => setFiles({ ...files, credit: event.target.files?.[0] })}/></label><button type="submit">Prévisualiser</button></form>{pending && <div className="local-preview"><p>{pending.report.lines} lignes · {pending.report.items} postes · {pending.report.schedule_rows} échéances · {pending.report.same_day_overwrites} écrasement(s) de même date.</p><p>Candidats PEA à examiner : {pending.report.pea_candidates.join(', ') || 'aucun'}.</p><button type="button" onClick={commitImport}>Confirmer l’import dans cette base vierge</button></div>}</section>
    </>}
  </main>;
}
