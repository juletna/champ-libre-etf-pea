import Modal from '../components/Modal.jsx';

export default function CapDialogs({ dialog, close, error, submit, account, setAccount, project, setProject, sources, baskets, basketId, setBasketId, targetName, setTargetName }) {
  const selected = baskets.find((entry) => entry.id === basketId);
  return <>
    <Modal open={dialog === 'account'} title="Ajouter un compte" onClose={close}>
      <form onSubmit={(event) => { event.preventDefault(); submit('account'); }}>
        <p>Vous pourrez associer vos postes à ce compte dans la Vue d’ensemble.</p>
        <div className="local-form">
          <label>Compte<input required autoFocus value={account.label} onChange={(event) => setAccount({ ...account, label: event.target.value })}/></label>
          <label>Titulaire<input required value={account.holder} onChange={(event) => setAccount({ ...account, holder: event.target.value })}/></label>
          <label>Enveloppe<input required value={account.envelope} onChange={(event) => setAccount({ ...account, envelope: event.target.value })}/></label>
        </div>
        {error && <p role="alert" className="app-modal-error">{error}</p>}
        <div className="app-modal-actions"><button type="button" className="app-modal-secondary" onClick={close}>Annuler</button><button type="submit">Ajouter le compte</button></div>
      </form>
    </Modal>
    <Modal open={dialog === 'project'} title={project.id ? 'Modifier le projet ou la réserve' : 'Ajouter un projet ou une réserve'} onClose={close}>
      <form onSubmit={(event) => { event.preventDefault(); submit('project'); }}>
        <p>Affectez une source pour que la somme soit déduite une seule fois des liquidités mobilisables.</p>
        <div className="local-form">
          <label>Projet ou réserve<input required autoFocus value={project.label} onChange={(event) => setProject({ ...project, label: event.target.value })}/></label>
          <label>Nature<select value={project.kind} onChange={(event) => setProject({ ...project, kind: event.target.value })}><option value="projet">Projet</option><option value="reserve">Réserve</option></select></label>
          <label>Montant à préserver (€)<input required type="number" min="0" step="0.01" value={project.amount_eur} onChange={(event) => setProject({ ...project, amount_eur: event.target.value })}/></label>
          <label>Échéance<input type="date" value={project.due_on} onChange={(event) => setProject({ ...project, due_on: event.target.value })}/></label>
          <label>Source à préserver<select value={project.funding_item_id} onChange={(event) => setProject({ ...project, funding_item_id: event.target.value })}><option value="">Non affectée</option>{sources.map((source) => <option key={source.item.id} value={source.item.id}>{source.item.label}</option>)}</select></label>
        </div>
        {error && <p role="alert" className="app-modal-error">{error}</p>}
        <div className="app-modal-actions"><button type="button" className="app-modal-secondary" onClick={close}>Annuler</button><button type="submit">{project.id ? 'Enregistrer les modifications' : 'Ajouter'}</button></div>
      </form>
    </Modal>
    <Modal open={dialog === 'target'} title="Activer une copie du panier" onClose={close}>
      <form onSubmit={(event) => { event.preventDefault(); if (selected) submit('target'); }}>
        <p>La cible active est une copie du panier enregistré. Modifier ensuite le panier ne changera pas cette cible.</p>
        <div className="local-form">
          <label>Panier enregistré<select required autoFocus value={basketId} onChange={(event) => { setBasketId(event.target.value); setTargetName(baskets.find((entry) => entry.id === event.target.value)?.name || ''); }}><option value="">Choisir…</option>{baskets.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
          <label>Nom de la cible<input required value={targetName} onChange={(event) => setTargetName(event.target.value)}/></label>
        </div>
        {error && <p role="alert" className="app-modal-error">{error}</p>}
        <div className="app-modal-actions"><button type="button" className="app-modal-secondary" onClick={close}>Annuler</button><button type="submit" disabled={!selected}>Activer la copie</button></div>
      </form>
    </Modal>
  </>;
}
