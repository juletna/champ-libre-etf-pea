import { useEffect, useRef, useState } from 'react';
import { money, planPurchases, readMigration, recordPurchases, writeMigration } from './engine';
import './migration.css';

const euro = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
const percent = (n) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n)} %`;
const today = () => new Date().toLocaleDateString('en-CA');

function Amount({ label, value, onChange, ...props }) {
  return <label>{label}<input type="number" inputMode="decimal" min="0" max="10000000000" step="0.01" placeholder="0,00" value={value} onChange={(e) => {
    const next = e.target.value === '' ? 0 : Number(e.target.value);
    if (Number.isFinite(next) && next >= 0 && next <= 1e10) onChange(money(next));
  }} {...props}/></label>;
}

function PurchaseReceipt({ data, plan, funds, onRecord, onCancel }) {
  const [purchases, setPurchases] = useState(() => Object.fromEntries(plan.rows.filter((r) => r.theoretical > 0).map((r) => [r.id, r.buy])));
  const [deposit, setDeposit] = useState(data.deposit);
  const [fees, setFees] = useState(plan.fees);
  const [error, setError] = useState('');
  return <form className="migration-receipt" onSubmit={(event) => {
    event.preventDefault();
    try { onRecord(recordPurchases(data, purchases, deposit, fees, today())); } catch (err) { setError(err.message); }
  }}>
    <h3>Ce que vous avez effectivement réalisé</h3>
    <p>Corrigez les montants d’après vos opérations. La valeur des positions augmente du montant acheté, hors frais. Actualisez ensuite leur valorisation si les cours ont changé.</p>
    <div className="migration-fields"><Amount label="Versement réalisé (€)" value={deposit} onChange={setDeposit}/><Amount label="Frais payés au total (€)" value={fees} onChange={setFees}/></div>
    {Object.keys(purchases).map((id) => <Amount key={id} label={`Achat ${funds[id].name} (€ hors frais)`} value={purchases[id]} onChange={(value) => setPurchases({ ...purchases, [id]: value })}/>)}
    {error && <p role="alert" className="migration-warning">{error}</p>}
    <div className="migration-actions"><button type="submit" className="allocation-button allocation-primary">Enregistrer les opérations réalisées</button><button type="button" className="allocation-button" onClick={onCancel}>Annuler</button></div>
  </form>;
}

export default function MigrationPlanner({ open, onClose, funds, weights, baskets, storage = window.localStorage, local = false }) {
  const dialog = useRef(null);
  const [initial] = useState(() => readMigration(storage, funds));
  const [data, setData] = useState(initial.data);
  const [saveError, setSaveError] = useState(initial.error);
  const [source, setSource] = useState('current');
  const [addId, setAddId] = useState('');
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [undo, setUndo] = useState(null);
  const [message, setMessage] = useState('');
  const catalog = Object.values(funds).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const plan = planPurchases(data);
  const sourceBasket = baskets.find((b) => b.id === source);
  const sourceWeights = source === 'current' ? weights : sourceBasket?.snapshot.weights;
  const sourceTotal = Object.values(sourceWeights || {}).reduce((sum, w) => sum + w, 0);
  const targetIds = Object.keys(data.target?.weights || {}).filter((id) => data.target.weights[id] > 0);

  useEffect(() => {
    if (open && !dialog.current.open) dialog.current.showModal();
    else if (!open && dialog.current.open) dialog.current.close();
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  useEffect(() => {
    if (initial.error) return;
    setSaveError(writeMigration(storage, data) ? '' : 'Sauvegarde impossible. Vos changements restent en mémoire tant que cette page reste ouverte.');
  }, [data, initial.error, storage]);

  function update(patch) { setData((old) => ({ ...old, ...patch })); setReceiptOpen(false); setUndo(null); setMessage(''); }
  function updateHolding(id, value) { update({ holdings: { ...data.holdings, [id]: value }, updatedAt: today() }); }
  function adoptTarget() {
    if (!sourceWeights || sourceTotal > 100.000001) return;
    update({ target: { name: source === 'current' ? 'Mon panier simulé' : sourceBasket.name, weights: { ...sourceWeights } } });
    setMessage('Cible mémorisée. Les prochaines modifications du simulateur ne la changeront pas.');
  }
  function updateQuote(id, patch) { update({ quotes: { ...data.quotes, [id]: { price: 0, date: today(), ...data.quotes[id], ...patch } } }); }

  return <dialog ref={dialog} className="migration-dialog" aria-labelledby="migration-title" onCancel={onClose} onClose={onClose}>
    <header className="migration-header"><div><span className="card-kicker">DU PANIER À VOS PROCHAINS ACHATS</span><h2 id="migration-title">Atteindre mon allocation</h2><p>Faites évoluer votre portefeuille réel grâce à vos versements, sans vendre.</p></div><button type="button" autoFocus className="allocation-button" onClick={onClose} aria-label="Fermer le plan d’achats">Fermer ×</button></header>
    <div className="migration-body">
      <p className={saveError ? 'migration-warning' : 'migration-local'} role="status">{saveError || (local ? 'Sauvegarde dans la base locale · Aucun ordre transmis' : 'Sauvegarde locale sur ce navigateur · Saisie manuelle · Aucun ordre transmis')}</p>
      <div className="migration-setup">
        <section className="migration-card"><span className="card-kicker">01 — POINT DE DÉPART</span><h3>Mon portefeuille réel</h3><p>Saisissez la valeur actuelle de vos lignes, hors liquidités.</p>
          {!Object.keys(data.holdings).length && <div className="migration-empty">Ajoutez votre premier ETF pour partir de ce que vous détenez déjà. Vous pouvez aussi démarrer avec un portefeuille vide.</div>}
          {Object.entries(data.holdings).map(([id, value]) => <div className="migration-holding" key={id}><Amount label={`${funds[id].name} (€)`} value={value} onChange={(v) => updateHolding(id, v)}/><button type="button" className="migration-remove" aria-label={`Retirer ${funds[id].name} du portefeuille réel`} onClick={() => { const holdings = { ...data.holdings }; delete holdings[id]; update({ holdings, updatedAt: today() }); }}>×</button></div>)}
          <div className="migration-add"><label>ETF détenu<select value={addId} onChange={(e) => setAddId(e.target.value)}><option value="">Choisir un ETF…</option>{catalog.filter((f) => !Object.hasOwn(data.holdings, f.isin)).map((f) => <option key={f.isin} value={f.isin}>{f.name} · {f.isin}</option>)}</select></label><button type="button" className="allocation-button" disabled={!addId} onClick={() => { updateHolding(addId, 0); setAddId(''); }}>Ajouter</button></div>
          <Amount label="Liquidités déjà disponibles (€)" value={data.cash} onChange={(cash) => update({ cash, updatedAt: today() })}/>
          <small>{data.updatedAt ? `Dernière saisie : ${data.updatedAt}.` : 'Valorisations à actualiser lors de chaque nouveau plan.'} Le fonds court terme reste une ligne ETF, distincte des liquidités.</small>
        </section>
        <section className="migration-card"><span className="card-kicker">02 — DESTINATION</span><h3>Mon allocation cible</h3><p>Choisissez le panier à rejoindre. Les pourcentages portent sur les ETF, pas sur leur exposition sectorielle.</p>
          <label>Allocation à utiliser<select value={source} onChange={(e) => setSource(e.target.value)}><option value="current">Panier simulé actuel</option>{baskets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          <button type="button" className="allocation-button" disabled={!sourceWeights || sourceTotal > 100.000001} onClick={adoptTarget}>{data.target ? 'Remplacer la cible par ce panier' : 'Utiliser ce panier comme cible'}</button>
          {data.target ? <div className="migration-target"><strong>{data.target.name}</strong><ul>{targetIds.map((id) => <li key={id}><span>{funds[id].name}</span><b>{percent(data.target.weights[id])}</b></li>)}{plan.cashWeight > 0.00001 && <li><span>Liquidités</span><b>{percent(plan.cashWeight)}</b></li>}</ul><small>Cible mémorisée indépendamment du simulateur.</small></div> : <div className="migration-empty">Choisissez une cible pour calculer vos prochains achats.</div>}
          <Amount label="Prochain versement (€)" value={data.deposit} onChange={(deposit) => update({ deposit })}/>
          {plan && <div className="migration-minimum">{plan.minimum.amount == null ? <><strong>Cible exacte impossible sans vendre</strong><p>Ces lignes sont absentes de la cible : {plan.minimum.excluded.map((id) => funds[id].name).join(', ')}. Des apports peuvent réduire leur poids, sans le ramener à zéro.</p></> : <><span>Apport minimum pour atteindre la cible</span><strong>{euro(plan.minimum.amount)}</strong><small>À valorisations constantes, hors frais et arrondis en parts.</small><button type="button" className="migration-link" onClick={() => update({ deposit: plan.minimum.amount })}>Utiliser ce montant</button></>}</div>}
        </section>
      </div>
      {plan && <section className="migration-card migration-plan"><div className="migration-plan-heading"><div><span className="card-kicker">03 — PASSER À L’ACTION</span><h3>Mes prochains achats</h3></div><div className="migration-mode" role="group" aria-label="Méthode de calcul"><button type="button" aria-pressed={data.mode === 'amount'} onClick={() => update({ mode: 'amount' })}>Montants théoriques</button><button type="button" aria-pressed={data.mode === 'shares'} onClick={() => update({ mode: 'shares' })}>Parts entières</button></div></div>
        {data.mode === 'shares' ? <details className="migration-quotes" open><summary>Prix indicatifs et frais</summary><p>Renseignez des prix en euros avec leur date. Les historiques mensuels du simulateur ne sont pas des prix d’exécution.</p><Amount label="Frais fixes par achat (€)" value={data.fee} onChange={(fee) => update({ fee })}/>{plan.rows.filter((r) => r.theoretical > 0).map((r) => <div className="migration-quote" key={r.id}><Amount label={`Prix par part — ${funds[r.id].name} (€)`} value={data.quotes[r.id]?.price || 0} onChange={(price) => updateQuote(r.id, { price })}/><label>Date du prix<input type="date" value={data.quotes[r.id]?.date || ''} max={today()} onChange={(e) => updateQuote(r.id, { date: e.target.value })}/></label></div>)}<small>Chaque enveloppe théorique est arrondie à la part inférieure après frais. Le reliquat reste disponible ; cette méthode ne garantit pas la combinaison optimale.</small></details> : <p className="migration-local">Répartition théorique en euros, hors frais. Passez en parts entières pour vérifier ce que votre budget permet d’acheter.</p>}
        {plan.missingPrices.length > 0 ? <p role="status" className="migration-warning">Complétez le prix et la date des {plan.missingPrices.length} ETF à acheter pour afficher un plan en parts entières.</p> : <>
          <div className="migration-metrics"><div><span>Disponible pour les achats</span><strong>{euro(plan.budget)}</strong></div><div><span>Achats proposés hors frais</span><strong>{euro(plan.rows.reduce((sum, r) => sum + r.buy, 0))}</strong></div><div><span>Liquidités après achats</span><strong>{euro(plan.remainingCash)}</strong></div></div>
          <div className="migration-table-scroll" tabIndex="0" role="region" aria-label="Comparaison avant et après les achats"><table className="migration-table"><thead><tr><th scope="col">ETF</th><th scope="col">Aujourd’hui</th><th scope="col">À acheter</th><th scope="col">Après achats</th><th scope="col">Cible</th></tr></thead><tbody>{plan.rows.filter((r) => r.before > 0 || r.target > 0).map((r) => <tr key={r.id}><th scope="row">{funds[r.id].name}<small>{r.id}</small></th><td>{euro(r.before)}<small>{percent(r.beforeWeight)}</small></td><td className={r.buy > 0 ? 'migration-buy' : ''}>{r.buy > 0 ? `+ ${euro(r.buy)}` : '—'}{data.mode === 'shares' && <small>{r.quantity || 0} part{r.quantity === 1 ? '' : 's'}</small>}</td><td>{euro(r.after)}<small>{percent(r.afterWeight)}</small></td><td>{percent(r.target)}</td></tr>)}<tr><th scope="row">Liquidités</th><td>{euro(data.cash)}<small>{percent(plan.currentTotal > 0 ? data.cash / plan.currentTotal * 100 : 0)}</small></td><td>—</td><td>{euro(plan.remainingCash)}<small>{percent(plan.cashAfterWeight)}</small></td><td>{percent(plan.cashWeight)}</td></tr></tbody></table></div>
          <div className="migration-result"><strong>{plan.afterTotal === 0 ? 'Ajoutez un versement pour démarrer.' : plan.gap < 0.01 ? 'Allocation cible atteinte après ces achats.' : `Écart restant avec la cible : ${percent(plan.gap).replace(' %', ' points')}.`}</strong><span>Total après achats : {euro(plan.afterTotal)} · Frais estimés : {data.mode === 'shares' ? euro(plan.fees) : 'non inclus'}</span></div>
          {data.mode === 'shares' && plan.budget > 0 && !plan.rows.some((r) => r.buy > 0) && <p className="migration-warning">Aucune part proposée avec ces enveloppes et ces prix. Les liquidités sont conservées pour un prochain versement.</p>}
          {!receiptOpen && <button type="button" className="allocation-button allocation-primary" disabled={!plan.rows.some((r) => r.buy > 0) && !data.deposit} onClick={() => { setReceiptOpen(true); setUndo(null); }}>Enregistrer mes achats réalisés</button>}
          {receiptOpen && <PurchaseReceipt data={data} plan={plan} funds={funds} onCancel={() => setReceiptOpen(false)} onRecord={(next) => { setUndo(data); setData(next); setReceiptOpen(false); setMessage('Opérations enregistrées. Le prochain plan a été recalculé ; le versement prévu a été remis à zéro.'); }}/>}</>}
        <details className="migration-method"><summary>Comment le plan est calculé</summary><p>À partir de la valeur totale après versement, les montants théoriques minimisent la somme des écarts au carré avec les poids cibles, sans vente. Les centimes sont répartis selon les restes d’arrondi. La part non allouée de la cible devient une réserve de liquidités. L’écart affiché est la moitié de la somme des écarts absolus de poids, liquidités comprises.</p><p>Les cours restent constants dans cette projection. Les prix, frais et valorisations sont à actualiser avant chaque achat. Les données du portefeuille réel sont propres à ce navigateur.</p></details>
      </section>}
      {message && <p className="migration-message" role="status">{message}</p>}{undo && <button type="button" className="allocation-button" onClick={() => { setData(undo); setUndo(null); setMessage('Enregistrement annulé.'); }}>Annuler l’enregistrement des opérations</button>}
    </div>
  </dialog>;
}
