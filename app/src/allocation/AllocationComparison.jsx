import { useEffect, useId, useMemo, useRef, useState } from 'react';
import PortfolioPortrait from '../portfolio/PortfolioPortrait';
import { ZONE_COUNTRIES } from './geography';

const pct = (value, digits = 1) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(value)} %`;
const month = (value) => new Date(`${value}-01T12:00:00`).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
const periods = [[12, '1 an'], [36, '3 ans'], [60, '5 ans'], [Infinity, 'Max']];

export default function AllocationComparison({ model, items, period, onPeriodChange }) {
  const headingId = useId();
  const [selectedIds, setSelectedIds] = useState(() => items.slice(0, 3).map((item) => item.id));
  const selected = useMemo(() => items.filter((item) => selectedIds.includes(item.id)), [items, selectedIds]);
  const exposures = useMemo(() => selected.map((item) => model.exposure(item.weights)), [model, selected]);
  const performance = useMemo(() => model.comparePerformance(selected.map((item) => item.weights), period), [model, selected, period]);
  function toggle(id) {
    setSelectedIds(selected.some((item) => item.id === id) ? selected.map((item) => item.id).filter((key) => key !== id) : [...selected.map((item) => item.id), id]);
  }
  function row(label, values, { description, highlight = false, digits = 1 } = {}) {
    return <tr key={label} className={highlight ? 'comparison-performance' : undefined}><th scope="row">{label}{description && <small>{description}</small>}</th>{values.map((value, index) => <td key={selected[index].id}>{value == null ? 'Indisponible' : pct(value, digits)}</td>)}</tr>;
  }
  return <section className="allocation-section allocation-comparison" aria-labelledby={headingId}>
    <div className="comparison-heading"><div><span className="allocation-kicker">CÔTE À CÔTE</span><h3 id={headingId}>Comparer les allocations</h3></div><label>Période<select value={String(period)} onChange={(event) => onPeriodChange(Number(event.target.value))}>{periods.map(([value, label]) => <option key={value} value={String(value)}>{label}</option>)}</select></label></div>
    <fieldset className="comparison-picker"><legend>Allocations à comparer · 4 maximum</legend>{items.map((item) => <label key={item.id}><input type="checkbox" checked={selectedIds.includes(item.id)} disabled={selected.length >= 4 && !selectedIds.includes(item.id)} onChange={() => toggle(item.id)}/><span>{item.name}</span></label>)}</fieldset>
    {selected.length < 2 ? <p className="allocation-note" role="status">Choisissez au moins deux allocations. Vos configurations enregistrées apparaissent ici.</p> : <>
      <p className="allocation-note" role="status">{performance.available ? <>Même période pour toutes : <strong>{month(performance.start)} – {month(performance.end)}</strong> ({performance.months} mois).{performance.limited && ' Historique commun plus court que la période demandée.'}</> : performance.reason}</p>
      <PortfolioPortrait model={model} items={selected} period={period}/>
      <p className="comparison-scroll-hint">Faites défiler le tableau horizontalement pour voir les autres allocations →</p>
      <div className="comparison-scroll" tabIndex={0} role="region" aria-label="Tableau des allocations, défilement horizontal et vertical">
        <table><caption className="allocation-sr-only">Performances totales, zones et secteurs des allocations sélectionnées</caption><thead><tr><th scope="col">Part du portefeuille</th>{selected.map((item) => <th scope="col" key={item.id}>{item.name}</th>)}</tr></thead><tbody>
          {row('Performance totale simulée', selected.map((_, i) => performance.available ? performance.totals[i] : null), { highlight: true, digits: 2 })}
          {row('Frais annuels pondérés', selected.map((item) => Object.entries(item.weights).reduce((sum, [id, weight]) => sum + (model.funds[id]?.fee || 0) * weight / 100, 0)), { digits: 2 })}
          <tr className="comparison-group"><th colSpan={selected.length + 1} scope="colgroup">Zones géographiques</th></tr>
          {model.zoneNames.map((name) => row(name, exposures.map((exposure) => exposure.zones[name] || 0), { description: ZONE_COUNTRIES[name] }))}
          <tr className="comparison-group"><th colSpan={selected.length + 1} scope="colgroup">Secteurs d’activité</th></tr>
          {model.sectorNames.map((name) => row(name, exposures.map((exposure) => exposure.sectors[name] || 0)))}
          <tr className="comparison-group"><th colSpan={selected.length + 1} scope="colgroup">Hors répartition actions connue</th></tr>
          {row('Fonds court terme', exposures.map((exposure) => exposure.cash))}
          {row('Composition indisponible', exposures.map((exposure) => exposure.unknown))}
          {row('Non alloué', exposures.map((exposure) => exposure.unallocated))}
        </tbody></table>
      </div>
      <p className="allocation-note">Expositions obtenues, en % du portefeuille total, selon les dernières compositions disponibles. Performance cumulée en EUR, distributions réinvesties et poids rétablis chaque mois ; solde non alloué à rendement nul. Les frais inclus dans les VL ne sont pas déduits une seconde fois. Hors courtage et fiscalité. Les performances passées ne préjugent pas des performances futures.</p>
    </>}
  </section>;
}

export function AllocationComparisonDialog({ open, onClose, ...props }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    if (open && !ref.current.open) ref.current.showModal();
    else if (!open && ref.current.open) ref.current.close();
  }, [open]);
  return <dialog ref={ref} className="allocation-dialog comparison-dialog" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="allocation-header"><h2 id={titleId}>Mes allocations côte à côte</h2><button type="button" className="allocation-close" aria-label="Fermer la comparaison" onClick={onClose}>×</button></div>
    <div className="allocation-body">{open && <AllocationComparison {...props}/>}</div>
  </dialog>;
}
