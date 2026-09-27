import { useEffect, useState } from 'react';
import catalog from '../etf_pea_fortuneo_amundi.json';
import { request } from './bridge.js';
import { prepareFortuneo } from './fortuneo.js';
import PeaDialogs from './PeaDialogs.jsx';
import './local.css';

const known = new Set(catalog.etf.map((entry) => entry.isin));
const today = () => new Date().toLocaleDateString('en-CA');
const euro = (value) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value || 0);
const ownerOptions = [['non_precise', 'Non précisée'], ['commun', 'Commun'], ['conjoint_1', 'Conjoint 1'], ['conjoint_2', 'Conjoint 2'], ['enfants', 'Enfants / hors foyer']];
async function api(path, payload) { return (await request(path, payload === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).json(); }

export default function Pea() {
  const [state, setState] = useState(null);
  const [household, setHousehold] = useState(null);
  const [message, setMessage] = useState('');
  const [dialog, setDialog] = useState(null);
  const [dialogError, setDialogError] = useState('');
  const [importStep, setImportStep] = useState(0);
  const [importOrigin, setImportOrigin] = useState('generic');
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
  useEffect(() => { setDialogError(''); }, [importStep]);
  const headers = text.trim() ? text.replace(/^\ufeff/, '').split(/\r?\n/, 1)[0].split(delimiter).map((value) => value.trim()) : [];
  function change(name, value) { setColumns((current) => ({ ...current, [name]: value })); setPreview(null); }
  function payload() { return { text, delimiter, columns, mode, as_of: asOf, cash_eur: cash }; }
  async function action(work) { setMessage(''); try { await work(); } catch (error) { setMessage(error.message); } }
  async function previewImport() {
    const frozen = payload();
    const result = await api('/api/pea-preview', frozen);
    setPreview({ data: result, payload: frozen });
    setImportOrigin('generic');
    setImportStep(2);
  }
  async function previewFortuneo() {
    const prepared = prepareFortuneo(text);
    const mapped = { isin: 'ISIN', label: 'Libellé', quantity: 'Quantité', value: 'Valorisation', price: '' };
    const frozen = { text: prepared.text, delimiter: '\t', columns: mapped, mode: 'partial', as_of: asOf, cash_eur: '' };
    const result = await api('/api/pea-preview', frozen);
    setPreview({ data: result, payload: frozen });
    setImportOrigin('fortuneo');
    setImportStep(2);
    setMessage(`${prepared.count} positions Fortuneo reconnues. Relevé partiel : espèces et positions absentes conservées.`);
  }
  async function commitImport() {
    const result = await api('/api/pea-import', preview.payload);
    setDialog(null); setImportStep(0);
    setPreview(null);
    try { await refresh(); } catch { setMessage('Relevé importé, mais l’affichage n’a pas pu être actualisé. Rechargez la page.'); return; }
    setMessage(result.duplicate ? 'Ce relevé est déjà importé. Aucun doublon créé.' : 'Relevé importé. Une nouvelle situation remplace les valeurs des lignes concernées.');
  }
  const chosen = household?.snapshot.items.find((item) => item.id === linkId);
  const difference = chosen && state ? state.total_eur - chosen.value_eur : null;
  function openDialog(name) { setDialogError(''); if (name === 'import') { setImportStep(0); setPreview(null); } setDialog(name); }
  async function submitDialog(work, success) {
    setDialogError('');
    let result;
    try { result = await work(); setDialog(null); }
    catch (error) { setDialogError(error.message); return; }
    try { await refresh(); setMessage(typeof success === 'function' ? success(result) : success); }
    catch { setMessage('Enregistrement effectué, mais l’affichage n’a pas pu être actualisé. Rechargez la page.'); }
  }
  async function runImport(work) { setDialogError(''); try { await work(); } catch (error) { setDialogError(error.message); } }
  return <main className="local-page"><header><span className="local-eyebrow">MON PEA</span><h1>Situation réelle</h1><p>Un relevé décrit la situation à une date. Il ne constitue pas une liste d’achats et ne permet pas de calculer votre performance personnelle.</p></header>
    {message && <p className="local-notice" role="status">{message}</p>}
    {!state && <p>Chargement du PEA…</p>}
    {state && <>
      <div className="local-metrics"><article><span>Valeur du compte</span><strong>{euro(state.total_eur)}</strong></article><article><span>Espèces</span><strong>{euro((state.account?.cash_cents || 0) / 100)}</strong></article><article><span>Positions</span><strong>{state.positions.length}</strong></article></div>
      {!state.account && <p className="local-empty">Aucun relevé PEA. Importez un tableau ou collez des lignes.</p>}
      {state.account && <section className="local-panel"><h2>Compte et propriété</h2><p><strong>{state.account.label}</strong> · titulaire {state.account.holder}.</p><p>Dernier relevé : {state.account.as_of || 'aucun'}. {state.account.include_in_household ? 'Inclus une seule fois dans le patrimoine.' : 'À rapprocher ou confirmer avant inclusion dans le patrimoine.'}</p><button type="button" onClick={() => openDialog('account')}>Modifier le compte</button></section>}
      {!!state.positions.length && <div className="local-table-wrap" role="region" tabIndex="0" aria-label="Positions du PEA"><table><thead><tr><th>ISIN et libellé</th><th>Quantité</th><th>Valorisation</th><th>Date</th><th>Analyse</th></tr></thead><tbody>{state.positions.map((position) => <tr key={position.isin}><th>{position.label}<small>{position.isin}</small></th><td>{position.quantity ?? 'Inconnue'}</td><td>{euro(position.value_eur)}</td><td>{position.valued_on}</td><td>{known.has(position.isin) ? 'Catalogue' : 'Hors catalogue · inclus dans le total'}</td></tr>)}</tbody></table></div>}
      {!!state.imports.length && <details className="local-panel"><summary>Relevés importés et retour arrière</summary><ul>{state.imports.map((entry, index) => <li key={entry.id}>{entry.as_of} · {entry.mode === 'complete' ? 'Complet' : 'Partiel'} · {entry.source}{index === 0 && <button type="button" onClick={() => action(async () => { await api('/api/pea-undo', { id: entry.id }); await refresh(); setMessage('Dernier import annulé.'); })}>Annuler ce dernier import</button>}</li>)}</ul></details>}
      <section className="local-panel"><h2>Importer un relevé</h2><p>CSV ou tableau copié. Vérifiez les colonnes et les positions avant de confirmer un relevé.</p><button type="button" onClick={() => openDialog('import')}>Importer un relevé</button></section>
      {state.account && !state.account.include_in_household && <section className="local-panel"><h2>Rapprocher avec le patrimoine</h2><p>Associez ce PEA à un poste existant qui représente le même compte, ou confirmez son inclusion comme compte distinct.</p><button type="button" onClick={() => openDialog('link')}>Rapprocher le PEA</button></section>}
      <PeaDialogs dialog={dialog} close={() => setDialog(null)} error={dialogError} state={state} household={household}
        account={account} setAccount={setAccount} ownerOptions={ownerOptions}
        saveAccount={() => submitDialog(() => api('/api/pea-account', account), 'Compte enregistré.')}
        linkId={linkId} setLinkId={setLinkId} linkDate={linkDate} setLinkDate={setLinkDate} chosen={chosen} difference={difference}
        saveLink={() => submitDialog(() => api('/api/pea-link', { item_id: linkId, effective_from: linkDate }), (result) => `Rapprochement enregistré. Écart à la date d’effet : ${euro(result.difference_eur)}.`)}
        include={() => submitDialog(() => api('/api/pea-include', { property_owner: account.property_owner }), 'PEA inclus dans le patrimoine comme compte distinct.')}
        text={text} setText={setText} delimiter={delimiter} setDelimiter={setDelimiter} mode={mode} setMode={setMode} asOf={asOf} setAsOf={setAsOf} cash={cash} setCash={setCash}
        headers={headers} columns={columns} change={change} preview={preview} setPreview={setPreview} step={importStep} setStep={setImportStep} importOrigin={importOrigin}
        previewImport={() => runImport(previewImport)} previewFortuneo={() => runImport(previewFortuneo)} commitImport={() => runImport(commitImport)}/>
    </>}
  </main>;
}
