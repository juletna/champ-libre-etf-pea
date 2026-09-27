import { useEffect, useState } from 'react';
import catalog from '../etf_pea_fortuneo_amundi.json';
import { request } from './bridge.js';
import './local.css';

const known = new Set(catalog.etf.map((entry) => entry.isin));
const today = () => new Date().toLocaleDateString('en-CA');
const euro = (value) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value || 0);
const ownerOptions = [['non_precise', 'Non précisée'], ['commun', 'Commun'], ['conjoint_1', 'Conjoint 1'], ['conjoint_2', 'Conjoint 2'], ['enfants', 'Enfants / hors foyer']];
async function api(path, payload) { return (await request(path, payload === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).json(); }

export default function Pea({ storage }) {
  const [state, setState] = useState(null);
  const [household, setHousehold] = useState(null);
  const [message, setMessage] = useState('');
  const [text, setText] = useState('');
  const [delimiter, setDelimiter] = useState(';');
  const [columns, setColumns] = useState({ isin: '', label: '', quantity: '', value: '', price: '' });
  const [mode, setMode] = useState('complete');
  const [asOf, setAsOf] = useState(today());
  const [cash, setCash] = useState('');
  const [preview, setPreview] = useState(null);
  const [linkId, setLinkId] = useState('');
  const [linkDate, setLinkDate] = useState(today());
  const [account, setAccount] = useState({ label: 'Mon PEA', holder: 'Non précisé', property_owner: 'non_precise' });
  async function refresh() {
    const [pea, context] = await Promise.all([api('/api/pea'), api('/api/household')]);
    setState(pea); setHousehold(context);
    if (pea.account) setAccount({ label: pea.account.label, holder: pea.account.holder, property_owner: pea.account.property_owner });
  }
  useEffect(() => { refresh().catch((error) => setMessage(error.message)); }, []);
  const headers = text.trim() ? text.replace(/^\ufeff/, '').split(/\r?\n/, 1)[0].split(delimiter).map((value) => value.trim()) : [];
  function change(name, value) { setColumns((current) => ({ ...current, [name]: value })); setPreview(null); }
  function payload() { return { text, delimiter, columns, mode, as_of: asOf, cash_eur: cash }; }
  async function action(work) { setMessage(''); try { await work(); } catch (error) { setMessage(error.message); } }
  async function previewImport() {
    const frozen = payload();
    const result = await api('/api/pea-preview', frozen);
    setPreview({ data: result, payload: frozen });
  }
  async function commitImport() {
    const result = await api('/api/pea-import', preview.payload);
    setPreview(null); await refresh();
    setMessage(result.duplicate ? 'Ce relevé est déjà importé. Aucun doublon créé.' : 'Relevé importé. Une nouvelle situation remplace les valeurs des lignes concernées.');
  }
  async function browserImport() {
    if (!storage.getItem('champ-libre.migration.v1')) throw new Error('Aucun ancien portefeuille trouvé dans la base. Importez d’abord l’export de son navigateur d’origine.');
    await api('/api/pea-browser-import', { as_of: asOf });
    await refresh(); setMessage('Anciennes valeurs importées sans quantités : complétez-les avec un relevé.');
  }
  const chosen = household?.snapshot.items.find((item) => item.id === linkId);
  const difference = chosen && state ? state.total_eur - chosen.value_eur : null;
  return <main className="local-page"><header><span className="local-eyebrow">MON PEA</span><h1>Situation réelle</h1><p>Un relevé décrit la situation à une date. Il ne constitue pas une liste d’achats et ne permet pas de calculer votre performance personnelle.</p></header>
    {message && <p className="local-notice" role="status">{message}</p>}
    {!state && <p>Chargement du PEA…</p>}
    {state && <>
      <div className="local-metrics"><article><span>Valeur du compte</span><strong>{euro(state.total_eur)}</strong></article><article><span>Espèces</span><strong>{euro((state.account?.cash_cents || 0) / 100)}</strong></article><article><span>Positions</span><strong>{state.positions.length}</strong></article></div>
      {!state.account && <p className="local-empty">Aucun relevé PEA. Importez un tableau, collez des lignes ou reprenez l’ancien portefeuille navigateur.</p>}
      {state.account && <section className="local-panel"><h2>Compte et propriété</h2><div className="local-form"><label>Nom du compte<input value={account.label} onChange={(event) => setAccount({ ...account, label: event.target.value })}/></label><label>Titulaire du compte<input value={account.holder} onChange={(event) => setAccount({ ...account, holder: event.target.value })}/></label><label>Propriété patrimoniale<select value={account.property_owner} onChange={(event) => setAccount({ ...account, property_owner: event.target.value })}>{ownerOptions.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label></div><p><button type="button" onClick={() => action(async () => { await api('/api/pea-account', account); await refresh(); setMessage('Compte enregistré.'); })}>Enregistrer le compte</button></p><p>Dernier relevé : {state.account.as_of || 'aucun'}. {state.account.include_in_household ? 'Inclus une seule fois dans le patrimoine.' : 'À rapprocher ou confirmer avant inclusion dans le patrimoine.'}</p></section>}
      {!!state.positions.length && <div className="local-table-wrap" role="region" tabIndex="0" aria-label="Positions du PEA"><table><thead><tr><th>ISIN et libellé</th><th>Quantité</th><th>Valorisation</th><th>Date</th><th>Analyse</th></tr></thead><tbody>{state.positions.map((position) => <tr key={position.isin}><th>{position.label}<small>{position.isin}</small></th><td>{position.quantity ?? 'Inconnue'}</td><td>{euro(position.value_eur)}</td><td>{position.valued_on}</td><td>{known.has(position.isin) ? 'Catalogue' : 'Hors catalogue · inclus dans le total'}</td></tr>)}</tbody></table></div>}
      {!!state.imports.length && <details className="local-panel"><summary>Relevés importés et retour arrière</summary><ul>{state.imports.map((entry, index) => <li key={entry.id}>{entry.as_of} · {entry.mode === 'complete' ? 'Complet' : 'Partiel'} · {entry.source}{index === 0 && <button type="button" onClick={() => action(async () => { await api('/api/pea-undo', { id: entry.id }); await refresh(); setMessage('Dernier import annulé.'); })}>Annuler ce dernier import</button>}</li>)}</ul></details>}
      <section className="local-panel"><h2>Importer un relevé</h2><p>CSV ou tableau copié, avec sélection explicite des colonnes. Une ligne absente dans un relevé partiel reste détenue. Un relevé complet remplace toutes les positions et requiert les espèces.</p><div className="local-form"><label>Fichier CSV<input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={(event) => { const file = event.target.files?.[0]; if (file) file.text().then((contents) => { setText(contents); setPreview(null); }); }}/></label><label>Séparateur<select value={delimiter} onChange={(event) => { setDelimiter(event.target.value); setPreview(null); }}><option value=";">Point virgule</option><option value=",">Virgule</option><option value={'\t'}>Tabulation</option></select></label><label>Date du relevé<input type="date" value={asOf} onChange={(event) => { setAsOf(event.target.value); setPreview(null); }}/></label><label>Nature du relevé<select value={mode} onChange={(event) => { setMode(event.target.value); setPreview(null); }}><option value="complete">Complet</option><option value="partial">Partiel</option></select></label><label>Espèces sur le PEA (€)<input inputMode="decimal" placeholder={mode === 'complete' ? 'Obligatoire' : 'Vide = inchangé'} value={cash} onChange={(event) => { setCash(event.target.value); setPreview(null); }}/></label></div><label className="local-wide-label">Coller le tableau<textarea rows="7" value={text} onChange={(event) => { setText(event.target.value); setPreview(null); }} placeholder={'ISIN;Libellé;Quantité;Valorisation\nFR0000000001;ETF fictif;2;120,50'}/></label>{!!headers.length && <div className="local-form">{[['isin', 'ISIN *'], ['label', 'Libellé'], ['quantity', 'Quantité'], ['value', 'Valorisation *'], ['price', 'Cours indicatif']].map(([field, label]) => <label key={field}>{label}<select value={columns[field]} onChange={(event) => change(field, event.target.value)}><option value="">Choisir…</option>{headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div>}<p><button type="button" onClick={() => action(previewImport)}>Prévisualiser le relevé</button></p>{preview && <div className="local-preview"><strong>{preview.data.positions.length} ligne(s) · total des lignes et espèces {euro(preview.data.total_eur)}</strong><p>{preview.data.incomplete} ligne(s) sans quantité. {preview.data.positions.filter((row) => !known.has(row.isin)).length} hors catalogue. {mode === 'partial' ? 'Les lignes absentes restent présentes.' : 'Les lignes absentes seront retirées.'}</p><div className="local-table-wrap"><table><thead><tr><th>ISIN</th><th>Quantité</th><th>Valorisation</th></tr></thead><tbody>{preview.data.positions.map((row) => <tr key={row.isin}><td>{row.isin}</td><td>{row.quantity ?? 'Inconnue'}</td><td>{euro(row.value_cents / 100)}</td></tr>)}</tbody></table></div><button type="button" onClick={() => action(commitImport)}>Confirmer ce relevé</button></div>}</section>
      <section className="local-panel"><h2>Reprendre l’ancien portefeuille navigateur</h2><p>Exportez les trois clés depuis leur origine, importez ce fichier dans l’application locale, puis choisissez ici la date des valeurs. Les quantités resteront inconnues.</p><button type="button" onClick={() => action(browserImport)}>Reprendre les anciennes valeurs à la date ci-dessus</button></section>
      {state.account && !state.account.include_in_household && <section className="local-panel"><h2>Rapprocher avec le patrimoine</h2><p>Choisissez l’ancien poste agrégé seulement si vous avez confirmé qu’il représente ce même PEA. Sa valeur historique reste visible avant la date d’effet.</p><div className="local-form"><label>Ancien poste<select value={linkId} onChange={(event) => setLinkId(event.target.value)}><option value="">Choisir…</option>{household?.snapshot.items.filter((item) => item.kind === 'actif' && item.id !== 'pea').map((item) => <option value={item.id} key={item.id}>{item.label} · {item.category} · {euro(item.value_eur)}</option>)}</select></label><label>Date d’effet<input type="date" value={linkDate} onChange={(event) => setLinkDate(event.target.value)}/></label></div>{chosen && <p>Ancienne valeur affichée : {euro(chosen.value_eur)} · PEA détaillé : {euro(state.total_eur)} · écart indicatif : {euro(difference)}. Contrôlez à la même date avant de confirmer.</p>}<p><button type="button" disabled={!linkId} onClick={() => action(async () => { const result = await api('/api/pea-link', { item_id: linkId, effective_from: linkDate }); await refresh(); setMessage(`Rapprochement enregistré. Écart à la date d’effet : ${euro(result.difference_eur)}.`); })}>Confirmer le rapprochement</button></p><p>Si aucun ancien poste ne représente ce PEA, indiquez sa propriété patrimoniale et confirmez son inclusion séparée.</p><button type="button" onClick={() => action(async () => { await api('/api/pea-include', { property_owner: account.property_owner }); await refresh(); setMessage('PEA inclus dans le patrimoine comme compte distinct.'); })}>Aucun ancien poste : inclure ce compte</button></section>}
    </>}
  </main>;
}
