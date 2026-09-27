import { useState } from 'react';

export default function PortfolioLibrary({ baskets, activeId, dirty, status, onLoad, onSave, onUpdate, onDelete, onUndoDelete, deleted, onCompare }) {
  const [name, setName] = useState(() => baskets.find((basket) => basket.id === activeId)?.name || 'Mon panier');
  const [choice, setChoice] = useState(activeId);
  const selected = baskets.find((basket) => basket.id === choice);
  const active = baskets.find((basket) => basket.id === activeId);
  return <section className="portfolio-library" aria-label="Paniers enregistrés">
    <div className="library-heading"><span className="card-kicker">VOTRE ESPACE LOCAL</span><h2>Mes paniers</h2><button type="button" className="allocation-button" onClick={onCompare}>Comparer les allocations</button><p role="status">{status || 'Brouillon sauvegardé automatiquement sur ce navigateur.'}</p></div>
    <div className="library-controls"><label>Panier enregistré<select value={selected ? choice : ''} onChange={(e) => setChoice(e.target.value)}><option value="">Choisir un panier…</option>{baskets.map((basket) => <option key={basket.id} value={basket.id}>{basket.name}</option>)}</select></label><button type="button" className="allocation-button" disabled={!selected} onClick={() => { onLoad(selected); setName(selected.name); }}>Charger</button><button type="button" className="library-delete" disabled={!selected} onClick={() => onDelete(selected.id)}>Supprimer</button></div>
    <form className="library-save" onSubmit={(event) => { event.preventDefault(); if (name.trim()) { const id = onSave(name.trim()); if (id) setChoice(id); } }}><label>Nom du panier<input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required/></label><button className="allocation-button allocation-primary" type="submit">Enregistrer une copie</button>{active && <button type="button" className="allocation-button" onClick={() => onUpdate(active.id, name.trim() || active.name)}>Mettre à jour « {active.name} »</button>}</form>
    <div className="library-footnote"><span>{active ? `Panier chargé : ${active.name}${dirty ? ' · modifications dans le brouillon' : ''}` : 'ETF, poids, verrous, filtres et réglages du constructeur sont conservés.'}</span>{deleted && <button type="button" onClick={onUndoDelete}>Annuler la suppression de « {deleted.name} »</button>}</div>
  </section>;
}
