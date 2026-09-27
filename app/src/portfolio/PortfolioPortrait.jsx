import { useId, useMemo, useState } from 'react';
import { INDICATORS, ROLE_LABELS, comparisonText, explain, metric, percent, portrait, roleFor } from './portrait.js';
import './portrait.css';

const SLEEVES = { ...ROLE_LABELS, cash: 'Court terme', unallocated: 'Non alloué' };
const month = (date) => new Date(`${date}-01T12:00:00`).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
const letter = (index) => String.fromCharCode(65 + index);

function Structure({ profile, name, index, comparison }) {
  return <div className="portrait-structure">
    <div className="portrait-structure-heading"><strong>{comparison && `${letter(index)} · `}{name}</strong><span>{percent(profile.equity)} actions</span></div>
    <div className="portrait-stack" role="img" aria-label={Object.entries(SLEEVES).map(([key, label]) => `${label} : ${percent(profile.sleeves[key])}`).join(', ')}>
      {Object.entries(SLEEVES).filter(([key]) => profile.sleeves[key] > 0).map(([key, label]) => <span key={key} className={`portrait-sleeve-${key}`} style={{ width: `${profile.sleeves[key]}%` }} title={`${label} : ${percent(profile.sleeves[key])}`}>{profile.sleeves[key] >= 12 ? percent(profile.sleeves[key]) : ''}</span>)}
    </div>
    <div className="portrait-legend">{Object.entries(SLEEVES).filter(([key]) => profile.sleeves[key] > 0).map(([key, label]) => <span key={key}><i className={`portrait-sleeve-${key}`}/>{label} <b>{percent(profile.sleeves[key])}</b></span>)}</div>
  </div>;
}

export default function PortfolioPortrait({ model, items, period, onRolesChange }) {
  const uid = useId();
  const [active, setActive] = useState('conviction');
  const profiles = useMemo(() => items.map((item) => portrait(model, item.weights, item.roles || item.snapshot?.portraitRoles)), [model, items]);
  const history = useMemo(() => model.compareRisk(items.map((item) => item.weights), period), [model, items, period]);
  const comparison = items.length > 1;
  const riskAt = (index) => history.available && profiles[index].invested > 0 ? history.metrics[index] : null;
  const first = profiles[0];
  if (!first) return null;
  const analysis = explain(first, riskAt(0), active, history.reason);
  const selected = INDICATORS.find((item) => item.id === active);
  return <section className="portfolio-portrait" aria-labelledby={`${uid}-heading`}>
    <header className="portrait-heading"><div><span className="portrait-kicker">PORTRAIT {comparison ? 'COMPARÉ' : 'DU PORTEFEUILLE'}</span><h2 id={`${uid}-heading`}>Comprendre votre équilibre.</h2></div><span className="portrait-tag">5 repères · sans note globale</span></header>
    <div className="portrait-structures">{profiles.map((profile, index) => <Structure key={items[index].id} profile={profile} name={items[index].name} index={index} comparison={comparison}/>)}</div>
    <p className="portrait-context">{history.available ? <>Résistance historique : {month(history.start)} – {month(history.end)} · {history.months} mois{comparison ? ', mêmes dates pour toutes les allocations' : ''}.{Number.isFinite(period) && history.months < period && ' Historique plus court que la période demandée.'}</> : <>Résistance historique indisponible : {history.reason}</>} Les autres repères utilisent les dernières compositions publiées.</p>
    <div className="portrait-metrics" role="group" aria-label="Choisir un indicateur à expliquer">
      {INDICATORS.map((indicator) => <button type="button" key={indicator.id} className="portrait-metric" aria-pressed={active === indicator.id} aria-controls={`${uid}-analysis`} onClick={() => setActive(indicator.id)}>
        <span className="portrait-metric-name">{indicator.name}<span aria-hidden="true">↗</span></span>
        {profiles.map((profile, index) => {
          const m = metric(profile, riskAt(index), indicator.id);
          return <span className="portrait-series" key={items[index].id} style={{ '--portrait-series': ['#427957', '#866997', '#a8793a', '#4d7d9a'][index] }}>
            <span className="portrait-metric-value">{comparison && <b className="portrait-series-letter">{letter(index)}</b>}<strong>{m.value}</strong><small>{m.caption}</small></span>
            <span className={`portrait-gauge${m.position == null ? ' portrait-gauge-unavailable' : ''}`} role={m.position == null ? undefined : 'meter'} aria-label={`${items[index].name} — ${indicator.name}`} aria-valuemin={m.position == null ? undefined : 0} aria-valuemax={m.position == null ? undefined : 100} aria-valuenow={m.position == null ? undefined : Math.min(100, Math.max(0, m.position))} aria-valuetext={`${m.value} ${m.caption}`}>
              {m.position != null && <><span className="portrait-gauge-fill" style={{ width: `${Math.min(100, Math.max(0, m.position))}%` }}/><i style={{ left: `${Math.min(100, Math.max(0, m.position))}%` }}/></>}
            </span>
          </span>;
        })}
        <span className="portrait-endpoints"><span>{indicator.left}</span><span>{indicator.right}</span></span>
      </button>)}
    </div>
    <div className="portrait-analysis" id={`${uid}-analysis`} aria-live="polite">
      <span className="portrait-kicker">CE QUE CELA RACONTE · {selected.name}</span>
      {comparison ? <><h3>Ce qui change par rapport à A.</h3><ul className="portrait-differences">{profiles.slice(1).map((profile, index) => <li key={items[index + 1].id}><strong>{letter(index + 1)} · {items[index + 1].name}</strong><p>{comparisonText(first, profile, riskAt(0), riskAt(index + 1), active)}</p></li>)}</ul><details className="portrait-detail"><summary>Comprendre le repère A</summary><p>{analysis.text}</p><div className="portrait-facts">{analysis.facts.map((fact) => <span key={fact}>{fact}</span>)}</div></details></> : <><h3>{analysis.title}</h3><p>{analysis.text}</p><div className="portrait-facts">{analysis.facts.map((fact) => <span key={fact}>{fact}</span>)}</div></>}
    </div>
    {onRolesChange && first.lines.length > 0 && <details className="portrait-detail"><summary>Personnaliser le rôle de mes ETF</summary><p>Classement initial : indices larges Monde, États-Unis, Europe et Japon en socle ; émergents globaux en complément ; autres indices en conviction. Adaptez ces rôles à votre intention. Ce choix ne change aucun poids.</p><div className="portrait-role-list">{first.lines.map((line) => <label key={line.id}><span>{line.name}<small>{line.id} · {percent(line.weight)}</small></span><select aria-label={`Rôle de ${line.name}`} value={roleFor(line.id, items[0].roles)} onChange={(event) => onRolesChange({ ...items[0].roles, [line.id]: event.target.value })}>{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}</div></details>}
    <details className="portrait-detail portrait-method"><summary>Lire les jauges et connaître leurs limites</summary><p>Chaque jauge a sa propre signification. Il n’y a pas de note globale ni de portefeuille gagnant. Les trois repères de composition portent sur les actions ; court terme et non alloué sont exclus. La part de convictions est exprimée en % du portefeuille total.</p><ul>
      <li><strong>Géographie :</strong> la valeur indique le poids du premier pays parmi les pays détaillés. Le curseur montre la part restante (100 moins cette valeur). « Autres pays » est exclu ; il faut au moins 80 % des actions détaillés.</li>
      <li><strong>Secteurs :</strong> la valeur est le poids des trois premiers secteurs dans les actions ; le curseur représente les autres secteurs. Un secteur « Finance » ne permet pas d’isoler les banques.</li>
      <li><strong>Convictions :</strong> somme des poids des lignes classées en conviction, avec leurs rôles sauvegardés dans chaque panier. Le réglage « Force de mes convictions » du constructeur pilote ses objectifs ; cette jauge décrit les lignes effectivement obtenues.</li>
      <li><strong>Écart au World :</strong> pour les zones puis les secteurs, moitié de la somme des écarts absolus des poids en %. Moyenne des deux résultats, de 0 à 100. Zones non détaillées exclues, poids restants ramenés à 100 ; couverture minimale de 80 % des deux côtés. Aucun calcul à partir des sociétés individuelles.</li>
      <li><strong>Résistance :</strong> plus fort recul sommet-creux entre fins de mois sur la période choisie, 12 mois continus minimum. Volatilité annualisée des rendements mensuels. Récupération mesurée depuis le sommet de cet épisode ; un sommet non retrouvé reste « non récupéré ». Le non alloué est simulé à rendement nul.</li>
    </ul><p>Une position actions sans composition vérifiée rend les repères de géographie, secteurs et écart indisponibles. Les historiques réels des parts sont utilisés, sans prolongation artificielle. Ajouter une part récente au comparatif peut raccourcir la période de toutes les allocations. Les performances passées ne préjugent pas des performances futures.</p></details>
  </section>;
}
