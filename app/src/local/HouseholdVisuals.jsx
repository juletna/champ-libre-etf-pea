import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { request } from './bridge.js';
import { summarizeAssets } from './household-view.js';
import './household-visuals.css';

const euro = (value) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value || 0);
const shortEuro = (value) => new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0) + ' €';
const dateLabel = (day) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${day}T12:00:00`));
const colors = ['#207a5b', '#d99b4b', '#5470ae', '#ad6b9c', '#86a35e', '#657884', '#b96e62', '#8e77aa'];

function colorFor(name, names) { return colors[names.indexOf(name) % colors.length]; }

function CategoryBar({ categories, total, names }) {
  if (!total) return <p className="household-muted">Aucun actif renseigné.</p>;
  let position = 0;
  const stops = categories.map(({ name, value }) => {
    const start = position;
    position += value / total * 100;
    return `${colorFor(name, names)} ${start}% ${position}%`;
  });
  return <>
    <div className="household-category-bar" role="img" aria-label={`Répartition des actifs : ${categories.map(({ name, value }) => `${name} ${Math.round(value / total * 100)} %`).join(', ')}`} style={{ background: `linear-gradient(to right, ${stops.join(', ')})` }}/>
    <ul className="household-category-list">{categories.map(({ name, value }) => <li key={name}><span className="household-swatch" style={{ background: colorFor(name, names) }}/><span>{name}</span><strong>{Math.round(value / total * 100)} %</strong></li>)}</ul>
  </>;
}

export function HouseholdVisuals({ snapshot, history }) {
  const { assets, owners } = summarizeAssets(snapshot.items);
  const names = [...new Set([...assets.map((entry) => entry.name), ...owners.flatMap((owner) => owner.categories.map((entry) => entry.name))])];
  const householdNet = owners.slice(0, 4).reduce((sum, owner) => sum + owner.net, 0);
  const showShare = householdNet > 0 && owners.slice(0, 4).every((owner) => owner.net >= 0);
  return <>
    <div className="household-charts">
      <section className="local-panel household-chart-panel" aria-labelledby="household-history-title">
        <h2 id="household-history-title">Évolution du patrimoine net</h2>
        <p className="household-muted">Valeur du foyer aux dates de relevé et aux échéances passées ; l’écart entre deux points n’est pas une performance.</p>
        {history.length ? <div className="household-chart" role="img" aria-label={`Patrimoine net de ${euro(history[0].net_eur)} le ${dateLabel(history[0].day)} à ${euro(history.at(-1).net_eur)} le ${dateLabel(history.at(-1).day)}`}>
          <ResponsiveContainer width="100%" height="100%"><LineChart data={history} margin={{ top: 12, right: 12, bottom: 8, left: 4 }}>
            <CartesianGrid stroke="#e2ebe4" vertical={false}/><XAxis dataKey="day" tickFormatter={(value) => value.slice(0, 7)} minTickGap={35} tick={{ fontSize: 11 }}/>
            <YAxis tickFormatter={shortEuro} width={72} tick={{ fontSize: 11 }}/>
            <Tooltip labelFormatter={dateLabel} formatter={(value) => [euro(value), 'Patrimoine net']}/>
            {history.some((point) => point.day === snapshot.day) && <ReferenceLine x={snapshot.day} stroke="#9caf9d" strokeDasharray="4 4"/>}
            <Line type="linear" dataKey="net_eur" stroke="#207a5b" strokeWidth={3} dot={history.length < 25} activeDot={{ r: 5 }} isAnimationActive={false}/>
          </LineChart></ResponsiveContainer>
        </div> : <p className="household-muted">Ajoutez un relevé pour afficher la courbe.</p>}
      </section>
      <section className="local-panel household-chart-panel" aria-labelledby="household-assets-title">
        <h2 id="household-assets-title">Répartition des actifs</h2>
        <p className="household-muted">Avoirs actuels du foyer par catégorie, hors dettes, enfants et prévisions.</p>
        <div className="household-asset-total">{euro(snapshot.assets_eur)} <small>total des actifs</small></div>
        <CategoryBar categories={assets} total={snapshot.assets_eur} names={names}/>
        {!!assets.length && <ul className="household-amount-list">{assets.map(({ name, value }) => <li key={name}><span>{name}</span><strong>{euro(value)}</strong></li>)}</ul>}
      </section>
    </div>
    <section className="local-panel household-ownership" aria-labelledby="household-ownership-title">
      <h2 id="household-ownership-title">Propriété et éléments à part</h2>
      <p className="household-muted">Chaque barre répartit les actifs de sa case. Le montant en tête est net des dettes ; les avoirs des enfants et le prévisionnel restent hors du total du foyer.</p>
      <div className="household-owner-grid">{owners.map((owner) => <article key={owner.id} className={owner.id === 'enfants' || owner.id === 'previsionnel' ? 'household-owner-separated' : ''}>
        <h3>{owner.label}</h3><strong className="household-owner-net">{euro(owner.net)}</strong>
        <p className="household-muted">{owner.id === 'enfants' || owner.id === 'previsionnel' ? 'Suivi séparé' : showShare ? `${Math.round(owner.net / householdNet * 100)} % du net du foyer` : 'Part du net non calculable'}</p>
        <CategoryBar categories={owner.categories} total={owner.assets} names={names}/>
        {owner.debts > 0 && <p className="household-owner-debt">Dettes : {euro(owner.debts)}</p>}
      </article>)}</div>
    </section>
  </>;
}

function CreditSchedule({ schedule, selectedDay }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function load(event) {
    if (!event.currentTarget.open || detail || loading) return;
    setLoading(true);
    try { setDetail(await (await request(`/api/schedule?id=${encodeURIComponent(schedule.id)}`)).json()); }
    catch (cause) { setError(cause.message); }
    finally { setLoading(false); }
  }
  const rows = detail?.rows || [];
  const lastPaid = [...rows].reverse().find((row) => row.due_on <= selectedDay);
  const next = rows.find((row) => row.due_on > selectedDay);
  return <details className="household-credit" onToggle={load}>
    <summary>{schedule.label} <span>{schedule.rows} échéances · reliquat final {euro(schedule.final_balance_eur)}</span></summary>
    {loading && <p>Chargement de l’échéancier…</p>}
    {error && <p role="alert">{error}</p>}
    {detail && <>
      <p>{detail.metadata.source || 'Échéancier bancaire'} · {lastPaid ? `Capital estimé après le ${dateLabel(lastPaid.due_on)} : ${euro(lastPaid.after_eur)}.` : `Capital avant la première échéance : ${euro(rows[0]?.before_eur)}.`} {next ? `Prochaine échéance : ${dateLabel(next.due_on)}, ${euro(next.payment_eur)}.` : 'Calendrier terminé.'}</p>
      <p className="household-muted">Les échéances passées à la date affichée sont supposées payées. Le reliquat final n’est pas ramené artificiellement à zéro ; vérifiez le solde auprès de la banque.</p>
      <div className="local-table-wrap household-schedule-table"><table><thead><tr><th>Date</th><th>Capital avant</th><th>Capital remboursé</th><th>Intérêts</th><th>Assurance</th><th>Échéance</th><th>Capital après</th></tr></thead><tbody>{rows.map((row) => <tr key={row.due_on} className={row.due_on === next?.due_on ? 'household-next-due' : row.due_on <= selectedDay ? 'household-past-due' : ''}>
        <td>{dateLabel(row.due_on)}</td><td>{euro(row.before_eur)}</td><td>{euro(row.repay_eur)}</td><td>{euro(row.interest_eur)}</td><td>{euro(row.insurance_eur)}</td><td>{euro(row.payment_eur)}</td><td>{euro(row.after_eur)}</td>
      </tr>)}</tbody></table></div>
    </>}
  </details>;
}

export function CreditSchedules({ schedules, selectedDay }) {
  if (!schedules.length) return null;
  return <section className="local-panel household-credits" aria-labelledby="household-credits-title"><h2 id="household-credits-title">Détail des crédits liés</h2>
    {schedules.map((schedule) => <CreditSchedule key={schedule.id} schedule={schedule} selectedDay={selectedDay}/>)}
  </section>;
}
