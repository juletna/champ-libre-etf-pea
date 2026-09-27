import { useEffect, useState } from 'react';
import catalog from '../etf_pea_fortuneo_amundi.json';
import { request } from './bridge.js';
import { planLocalInvestment } from './investment.js';
import './local.css';

const names = Object.fromEntries(catalog.etf.map((entry) => [entry.isin, entry.nom]));
const today = () => new Date().toLocaleDateString('en-CA');
const euro = (value) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value || 0);
const percent = (value) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value)} %`;
const defaultRule = { broker: 'Fortuneo', eligibleIsins: [], start: '2026-09-01', end: '2026-12-31', minimum: 500, maximum: 100000, percent: 0.35, fixed: 0 };

export default function NextInvestment({ openCap, openPea }) {
  const [pea, setPea] = useState(null);
  const [budget, setBudget] = useState(null);
  const [message, setMessage] = useState('');
  const [quotes, setQuotes] = useState({});
  const [rule, setRule] = useState(defaultRule);
  const [deposit, setDeposit] = useState('');
  useEffect(() => {
    Promise.all(['/api/pea', '/api/budget'].map(async (path) => (await request(path)).json()))
      .then(([account, context]) => { setPea(account); setBudget(context); setDeposit(String(context.settings.chosen_deposit_eur)); })
      .catch((error) => setMessage(error.message));
  }, []);
  const target = budget?.targets.find((entry) => entry.active);
  const positions = pea?.positions || [];
  const cash = (pea?.account?.cash_cents || 0) / 100;
  const depositNumber = Number(deposit);
  const validDeposit = deposit !== '' && Number.isFinite(depositNumber) && depositNumber >= 0 && depositNumber <= (budget?.max_oneoff_eur || 0)
    && depositNumber <= (budget?.settings.chosen_deposit_eur || 0);
  const ruleValid = rule.broker.trim() && rule.start <= rule.end && rule.minimum >= 0 && rule.maximum >= rule.minimum && rule.percent >= 0 && rule.fixed >= 0;
  const plan = pea && budget && validDeposit && ruleValid ? planLocalInvestment({ positions, cash, deposit: depositNumber, target, quotes, rule, today: today() }) : null;
  const ids = target ? Object.keys(target.weights).filter((isin) => target.weights[isin] > 0) : [];
  return <main className="local-page"><header><span className="local-eyebrow">PROCHAIN INVESTISSEMENT</span><h1>Préparer mes achats</h1><p>Plan indicatif sans vente ni ordre transmis. Le réel vient du dernier relevé PEA ; cette simulation ne l’altère pas. Un nouvel import actualisera vos avoirs.</p></header>
    {message && <p role="alert" className="local-notice">{message}</p>}
    {!pea || !budget ? <p>Chargement…</p> : <>
      <div className="local-metrics"><article><span>PEA actuel</span><strong>{euro(pea.total_eur)}</strong></article><article><span>Espèces PEA</span><strong>{euro(cash)}</strong></article><article><span>Versement retenu au budget</span><strong>{euro(budget.settings.chosen_deposit_eur)}</strong></article></div>
      {!pea.account && <section className="local-panel"><p>Aucun relevé PEA. Importez une situation réelle avant de préparer des achats.</p><button type="button" onClick={openPea}>Ouvrir Mon PEA</button></section>}
      {!target && <section className="local-panel"><p>Aucune cible active. Copiez un panier dans Mon cap.</p><button type="button" onClick={openCap}>Ouvrir Mon cap</button></section>}
      {pea.account && target && <>
        <section className="local-panel"><h2>Situation et versement</h2><p>Cible active : <strong>{target.name}</strong> · version {target.version}. Le versement n’est ajouté qu’à cette projection ; la capacité mensuelle future reste distincte.</p><label>Versement envisagé (€)<input type="number" min="0" max={Math.min(budget.max_oneoff_eur, budget.settings.chosen_deposit_eur)} step="0.01" value={deposit} onChange={(event) => setDeposit(event.target.value)}/></label>{!validDeposit && <p role="alert">Le versement doit rester dans le budget ponctuel retenu et les liquidités mobilisables.</p>}{positions.some((position) => position.quantity == null) && <p>Quantité inconnue pour {positions.filter((position) => position.quantity == null).map((position) => position.isin).join(', ')} : la valorisation est utilisée, les parts détenues ne sont pas déduites.</p>}{positions.filter((position) => !names[position.isin]).length > 0 && <p>Position(s) hors catalogue conservée(s) dans le réel : {positions.filter((position) => !names[position.isin]).map((position) => position.isin).join(', ')}.</p>}</section>
        <section className="local-panel"><h2>Courtage à vérifier</h2><p>Règle paramétrable, appliquée par ordre. Cochez uniquement les ISIN dont vous avez confirmé l’éligibilité. L’offre Fortuneo Amundi Freetrade annoncée pour le 1er septembre au 31 décembre 2026 concerne certains ETF, les achats de 500 à 100 000 €. Le tarif hors offre dépend de votre formule ; les 0,35 % préremplis correspondent à Starter hors premier ordre gratuit du mois, qu’il faut vérifier séparément.</p><p><a href="https://www.fortuneo.fr/bourse/freetrade-amundi" target="_blank" rel="noreferrer">Conditions de l’offre</a> · <a href="https://www.fortuneo.fr/bourse/freetrade-amundi/etf" target="_blank" rel="noreferrer">Liste des ETF éligibles</a> · <a href="https://www.fortuneo.fr/faq/quels-sont-les-frais-de-courtage-pour-un-ordre-sur-une-action-francaise" target="_blank" rel="noreferrer">Tarifs Fortuneo</a></p><div className="local-form"><label>Courtier<input value={rule.broker} onChange={(event) => setRule({ ...rule, broker: event.target.value })}/></label><label>Début de l’offre<input type="date" value={rule.start} onChange={(event) => setRule({ ...rule, start: event.target.value })}/></label><label>Fin de l’offre<input type="date" value={rule.end} onChange={(event) => setRule({ ...rule, end: event.target.value })}/></label><label>Seuil minimum (€)<input type="number" min="0" step="0.01" value={rule.minimum} onChange={(event) => setRule({ ...rule, minimum: Number(event.target.value) })}/></label><label>Seuil maximum (€)<input type="number" min="0" step="0.01" value={rule.maximum} onChange={(event) => setRule({ ...rule, maximum: Number(event.target.value) })}/></label><label>Tarif hors offre (%)<input type="number" min="0" step="0.01" value={rule.percent} onChange={(event) => setRule({ ...rule, percent: Number(event.target.value) })}/></label><label>Part fixe hors offre (€)<input type="number" min="0" step="0.01" value={rule.fixed} onChange={(event) => setRule({ ...rule, fixed: Number(event.target.value) })}/></label></div>{!ruleValid && <p role="alert">Vérifiez les dates, seuils et tarifs.</p>}</section>
        <section className="local-panel"><h2>Prix indicatifs datés</h2><p>Saisissez le prix de bourse actuel ; les valeurs liquidatives mensuelles du simulateur ne sont pas des cours d’achat. Un prix de plus de sept jours bloque le calcul de cette ligne.</p><div className="local-form">{ids.map((isin) => <div key={isin}><strong>{names[isin] || isin}</strong><small> {isin}</small><label>Éligible à l’offre choisie <input type="checkbox" checked={rule.eligibleIsins.includes(isin)} onChange={(event) => setRule({ ...rule, eligibleIsins: event.target.checked ? [...rule.eligibleIsins, isin] : rule.eligibleIsins.filter((id) => id !== isin) })}/></label><label>Prix par part (€)<input type="number" min="0.01" step="0.01" value={quotes[isin]?.price || ''} onChange={(event) => setQuotes({ ...quotes, [isin]: { price: Number(event.target.value), date: quotes[isin]?.date || today() } })}/></label><label>Date du prix<input type="date" max={today()} value={quotes[isin]?.date || today()} onChange={(event) => setQuotes({ ...quotes, [isin]: { price: quotes[isin]?.price || 0, date: event.target.value } })}/></label></div>)}</div></section>
        {plan?.error ? <p role="alert">{plan.error}</p> : plan && <section className="local-panel"><h2>Achats proposés en parts entières</h2>{plan.missingPrices.length > 0 && <p role="alert">Prix absent ou périmé : {plan.missingPrices.join(', ')}. Ces achats ne sont pas proposés.</p>}<div className="local-table-wrap"><table><thead><tr><th>ETF</th><th>Avant</th><th>Part(s)</th><th>Achat</th><th>Frais</th><th>Après</th><th>Cible</th></tr></thead><tbody>{plan.rows.filter((row) => row.before > 0 || row.target > 0).map((row) => <tr key={row.id}><th>{names[row.id] || row.id}<small>{row.id}</small></th><td>{euro(row.before)}</td><td>{row.quantity}</td><td>{euro(row.buy)}</td><td>{euro(row.fee)}</td><td>{euro(row.after)}<small>{percent(row.afterWeight)}</small></td><td>{percent(row.target)}</td></tr>)}</tbody></table></div><p>Achats : {euro(plan.rows.reduce((sum, row) => sum + row.buy, 0))} · frais : {euro(plan.fees)} · espèces conservées : {euro(plan.remainingCash)} · écart indicatif à la cible : {percent(plan.gap)}. Aucun budget supplémentaire n’est ajouté pour atteindre un seuil d’offre.</p><p>Répartition heuristique par enveloppes théoriques ; elle ne garantit pas l’optimum global. Prix et valorisations supposés constants.</p></section>}
      </>}
    </>}
  </main>;
}
