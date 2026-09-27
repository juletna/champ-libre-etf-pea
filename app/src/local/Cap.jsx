import { useEffect, useState } from 'react';
import CapDialogs from './CapDialogs.jsx';
import { request } from './bridge.js';
import './local.css';

const euro = (value) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value || 0);
async function api(path, payload) { return (await request(path, payload === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).json(); }
const newProject = () => ({ label: '', kind: 'projet', amount_eur: '', due_on: '', funding_item_id: '' });

export default function Cap({ storage, openCatalog }) {
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');
  const [dialog, setDialog] = useState(null);
  const [dialogError, setDialogError] = useState('');
  const [project, setProject] = useState(newProject);
  const [settings, setSettings] = useState({ monthly_eur: 0, chosen_deposit_eur: 0, horizon_years: '', risk: 'non_precise' });
  const [account, setAccount] = useState({ label: '', holder: '', envelope: '' });
  const [basketId, setBasketId] = useState('');
  const [targetName, setTargetName] = useState('');
  async function refresh() {
    const result = await api('/api/budget');
    setData(result); setSettings({ monthly_eur: result.settings.monthly_eur, chosen_deposit_eur: result.settings.chosen_deposit_eur, horizon_years: result.settings.horizon_years || '', risk: result.settings.risk });
  }
  useEffect(() => { refresh().catch((error) => setMessage(error.message)); }, []);
  async function action(work) { setMessage(''); try { await work(); } catch (error) { setMessage(error.message); } }
  async function submitDialog(kind) {
    setDialogError('');
    try {
      if (kind === 'account') {
        await api('/api/account', account);
        setAccount({ label: '', holder: '', envelope: '' });
      } else if (kind === 'project') {
        await api('/api/project', project);
        setProject(newProject());
      } else if (kind === 'target') {
        const selectedBasket = baskets.find((entry) => entry.id === basketId);
        if (!selectedBasket) return;
        await api('/api/target', { name: targetName, weights: selectedBasket.snapshot.weights, source: `panier ${selectedBasket.id}` });
      }
      setDialog(null);
    } catch (error) { setDialogError(error.message); return; }
    try {
      await refresh();
      setMessage(kind === 'account' ? 'Compte créé.' : kind === 'project' ? 'Projet ou réserve enregistré.' : 'Copie versionnée activée. Le panier reste indépendant.');
    } catch { setMessage('Enregistrement effectué, mais l’affichage n’a pas pu être actualisé. Rechargez la page.'); }
  }
  function openDialog(name) { setDialogError(''); setDialog(name); }
  let workspace = null;
  try { workspace = JSON.parse(storage.getItem('champ-libre.workspace.v1') || 'null'); } catch { /* leave basket list empty */ }
  const baskets = workspace?.baskets || [];
  const active = data?.targets.find((entry) => entry.active);
  return <main className="local-page"><header><span className="local-eyebrow">MON CAP</span><h1>Budget et cible</h1><p>Choisissez les fonds mobilisables et préservez vos projets. L’horizon et le risque sont déclarés ; ils ne produisent pas une recommandation automatique.</p></header>
    {message && <p role="status" className="local-notice">{message}</p>}
    {!data && <p>Chargement du budget…</p>}
    {data && <>
      <div className="local-metrics"><article><span>Patrimoine net</span><strong>{euro(data.snapshot.net_eur)}</strong></article><article><span>Patrimoine financier identifié</span><strong>{euro(data.financial_eur)}</strong><small>Postes non classés : {euro(data.unknown_eur)}</small></article><article><span>Liquidités mobilisables</span><strong>{euro(data.max_oneoff_eur)}</strong><small>Après réserves affectées</small></article></div>
      <section className="local-panel"><h2>Comptes et enveloppes</h2><p>Le titulaire d’un compte est distinct de la propriété patrimoniale du poste. Associez ensuite les postes au compte dans la Vue d’ensemble.</p>{!!data.accounts.length && <ul>{data.accounts.map((entry) => <li key={entry.id}>{entry.label} · {entry.envelope} · titulaire {entry.holder}</li>)}</ul>}<button type="button" onClick={() => { setAccount({ label: '', holder: '', envelope: '' }); openDialog('account'); }}>Ajouter un compte</button></section>
      <section className="local-panel"><h2>Sources de financement</h2><p>Seuls les actifs classés explicitement en liquidités, actuels et dans le foyer apparaissent ici. Sélectionner un poste confirme qu’il peut financer ce PEA. Les postes réservés restent indisponibles.</p>{!data.sources.length && <p className="local-empty">Aucune liquidité classée. Classez les postes dans la Vue d’ensemble.</p>}<ul className="local-source-list">{data.sources.map((source) => <li key={source.item.id}><label><input type="checkbox" checked={source.selected} onChange={(event) => action(async () => { await api('/api/funding', { item_id: source.item.id, selected: event.target.checked }); await refresh(); })}/><strong>{source.item.label}</strong> · {source.item.owner} · valeur {euro(source.item.value_eur)}</label><span>Réserves affectées {euro(source.reserved_eur)} · mobilisable {euro(source.available_eur)}{!source.eligible && ' · poste réservé'}{source.over_reserved && ' · réserve supérieure au solde'}</span></li>)}</ul></section>
      <section className="local-panel"><h2>Projets et réserves</h2><p>Une somme ne réduit le budget que si elle est affectée à une source précise ; elle n’est soustraite qu’une fois de cette source.</p>{!!data.projects.length && <ul>{data.projects.map((entry) => <li key={entry.id}>{entry.label} · {euro(entry.amount_eur)} · {entry.due_on || 'sans échéance'} · {data.sources.find((source) => source.item.id === entry.funding_item_id)?.item.label || 'source à affecter'} <button type="button" onClick={() => { setProject({ id: entry.id, label: entry.label, kind: entry.kind, amount_eur: entry.amount_eur, due_on: entry.due_on || '', funding_item_id: entry.funding_item_id || '' }); openDialog('project'); }}>Modifier</button></li>)}</ul>}<button type="button" onClick={() => { setProject(newProject()); openDialog('project'); }}>Ajouter un projet ou une réserve</button></section>
      <section className="local-panel"><h2>Budget déclaré</h2><p>La capacité mensuelle est future et n’est pas ajoutée aux espèces actuelles. Le versement ponctuel doit rester dans la limite des liquidités mobilisables.</p><div className="local-form"><label>Capacité mensuelle (€)<input type="number" min="0" step="0.01" value={settings.monthly_eur} onChange={(event) => setSettings({ ...settings, monthly_eur: event.target.value })}/></label><label>Versement ponctuel retenu (€)<input type="number" min="0" max={data.max_oneoff_eur} step="0.01" value={settings.chosen_deposit_eur} onChange={(event) => setSettings({ ...settings, chosen_deposit_eur: event.target.value })}/></label><label>Horizon (années)<input type="number" min="1" max="60" value={settings.horizon_years} onChange={(event) => setSettings({ ...settings, horizon_years: event.target.value })}/></label><label>Risque déclaré<select value={settings.risk} onChange={(event) => setSettings({ ...settings, risk: event.target.value })}><option value="non_precise">Non précisé</option><option value="prudent">Prudent</option><option value="equilibre">Équilibré</option><option value="dynamique">Dynamique</option></select></label></div><p><button type="button" onClick={() => action(async () => { await api('/api/budget-settings', settings); await refresh(); setMessage('Budget enregistré sans modifier les avoirs.'); })}>Enregistrer le budget</button></p></section>
      <section className="local-panel"><h2>Cible active</h2>{active ? <p><strong>{active.name}</strong> · version {active.version} · {Object.entries(active.weights).map(([isin, weight]) => `${isin} ${weight} %`).join(' · ')}</p> : <p className="local-empty">Aucune cible active. Construisez ou enregistrez un panier, puis activez-en une copie ici.</p>}<p><button type="button" onClick={openCatalog}>Ouvrir le constructeur ETF</button></p><button type="button" disabled={!baskets.length} onClick={() => { setBasketId(''); setTargetName(''); openDialog('target'); }}>Activer une copie d’un panier</button></section>
      <CapDialogs dialog={dialog} close={() => setDialog(null)} error={dialogError} submit={submitDialog} account={account} setAccount={setAccount} project={project} setProject={setProject} sources={data.sources} baskets={baskets} basketId={basketId} setBasketId={setBasketId} targetName={targetName} setTargetName={setTargetName}/>
    </>}
  </main>;
}
