import { useState } from 'react';
import Modal from '../components/Modal.jsx';

export default function PortfolioLibrary({ baskets, activeId, dirty, status, onLoad, onSave, onUpdate, onDelete, onUndoDelete, deleted, onCompare }) {
  const [name, setName] = useState(() => baskets.find((basket) => basket.id === activeId)?.name || 'Mon panier');
  const [choice, setChoice] = useState(activeId);
  const [saveMode, setSaveMode] = useState(null);
  const [saveError, setSaveError] = useState('');
  const selected = baskets.find((basket) => basket.id === choice);
  const active = baskets.find((basket) => basket.id === activeId);
  function openSave(mode) { setName(mode === 'update' ? active.name : active?.name || 'Mon panier'); setSaveError(''); setSaveMode(mode); }
  function submit(event) {
    event.preventDefault();
    const title = name.trim();
    if (!title) return;
    const result = saveMode === 'update' ? onUpdate(active.id, title) : onSave(title);
    if (!result) { setSaveError('Enregistrement impossible. Vérifiez le message de stockage dans Mes paniers.'); return; }
    if (saveMode === 'copy') setChoice(result);
    setSaveMode(null);
  }
  return <section className="portfolio-library" aria-label="Paniers enregistrés">
    <div className="library-heading"><span className="card-kicker">VOTRE ESPACE LOCAL</span><h2>Mes paniers</h2><button type="button" className="allocation-button" onClick={onCompare}>Comparer les allocations</button><p role="status">{status || 'Brouillon en cours de chargement.'}</p></div>
    <div className="library-controls"><label>Panier enregistré<select value={selected ? choice : ''} onChange={(e) => setChoice(e.target.value)}><option value="">Choisir un panier…</option>{baskets.map((basket) => <option key={basket.id} value={basket.id}>{basket.name}</option>)}</select></label><button type="button" className="allocation-button" disabled={!selected} onClick={() => { onLoad(selected); setName(selected.name); }}>Charger</button><button type="button" className="library-delete" disabled={!selected} onClick={() => onDelete(selected.id)}>Supprimer</button></div>
    <div className="library-save"><button type="button" className="allocation-button allocation-primary" onClick={() => openSave('copy')}>Enregistrer une copie</button>{active && <button type="button" className="allocation-button" onClick={() => openSave('update')}>Mettre à jour « {active.name} »</button>}</div>
    <div className="library-footnote"><span>{active ? `Panier chargé : ${active.name}${dirty ? ' · modifications dans le brouillon' : ''}` : 'ETF, poids, verrous, filtres et réglages du constructeur sont conservés.'}</span>{deleted && <button type="button" onClick={onUndoDelete}>Annuler la suppression de « {deleted.name} »</button>}</div>
    <Modal open={saveMode !== null} title={saveMode === 'update' ? 'Mettre à jour le panier' : 'Enregistrer une copie'} onClose={() => setSaveMode(null)}>
      <form onSubmit={submit}><p>{saveMode === 'update' ? `Les réglages actuels remplaceront ceux de « ${active?.name || ''} ».` : 'Une nouvelle copie du panier actuel sera enregistrée dans Mes paniers.'}</p><label className="library-modal-label">Nom du panier<input required autoFocus maxLength={60} value={name} onChange={(event) => setName(event.target.value)}/></label>{saveError && <p role="alert" className="app-modal-error">{saveError}</p>}<div className="app-modal-actions"><button type="button" className="app-modal-secondary" onClick={() => setSaveMode(null)}>Annuler</button><button type="submit">{saveMode === 'update' ? 'Mettre à jour' : 'Enregistrer la copie'}</button></div></form>
    </Modal>
  </section>;
}
