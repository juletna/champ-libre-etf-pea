import Modal from '../components/Modal.jsx';
import catalog from '../etf_pea_fortuneo_amundi.json';

const known = new Set(catalog.etf.map((entry) => entry.isin));
const euro = (value) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value || 0);
const steps = ['Données', 'Colonnes', 'Vérification'];

export default function PeaDialogs({ dialog, close, error, state, household, account, setAccount, ownerOptions, saveAccount, linkId, setLinkId, linkDate, setLinkDate, chosen, difference, saveLink, include, text, setText, delimiter, setDelimiter, mode, setMode, asOf, setAsOf, cash, setCash, headers, columns, change, preview, setPreview, step, setStep, importOrigin, previewImport, previewFortuneo, commitImport }) {
  return <>
    <Modal open={dialog === 'account'} title="Modifier le compte PEA" onClose={close}>
      <form onSubmit={(event) => { event.preventDefault(); saveAccount(); }}>
        <div className="local-form"><label>Nom du compte<input required autoFocus value={account.label} onChange={(event) => setAccount({ ...account, label: event.target.value })}/></label><label>Titulaire du compte<input required value={account.holder} onChange={(event) => setAccount({ ...account, holder: event.target.value })}/></label><label>Propriété patrimoniale<select value={account.property_owner} onChange={(event) => setAccount({ ...account, property_owner: event.target.value })}>{ownerOptions.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label></div>
        {error && <p role="alert" className="app-modal-error">{error}</p>}
        <div className="app-modal-actions"><button type="button" className="app-modal-secondary" onClick={close}>Annuler</button><button type="submit">Enregistrer le compte</button></div>
      </form>
    </Modal>
    <Modal open={dialog === 'link'} title="Rapprocher le PEA avec le patrimoine" onClose={close}>
      <div className="app-modal-content">
        <p>Choisissez un poste existant seulement s’il représente ce même PEA. Sa valeur historique reste visible avant la date d’effet.</p>
        <form className="app-modal-inner-form" onSubmit={(event) => { event.preventDefault(); saveLink(); }}>
          <div className="local-form"><label>Poste existant<select required value={linkId} onChange={(event) => setLinkId(event.target.value)}><option value="">Choisir…</option>{household?.snapshot.items.filter((item) => item.kind === 'actif' && item.id !== 'pea').map((item) => <option value={item.id} key={item.id}>{item.label} · {item.category} · {euro(item.value_eur)}</option>)}</select></label><label>Date d’effet<input required type="date" value={linkDate} onChange={(event) => setLinkDate(event.target.value)}/></label></div>
          {chosen && <p>Valeur du poste affichée : {euro(chosen.value_eur)} · PEA détaillé : {euro(state.total_eur)} · écart indicatif : {euro(difference)}. Contrôlez à la même date avant de confirmer.</p>}
          {error && <p role="alert" className="app-modal-error">{error}</p>}
          <div className="app-modal-actions"><button type="button" className="app-modal-secondary" onClick={close}>Annuler</button><button type="submit" disabled={!linkId}>Confirmer le rapprochement</button></div>
        </form>
        <div className="app-modal-alternative"><p>Si aucun poste existant ne représente ce PEA, confirmez son inclusion comme compte distinct.</p><button type="button" className="app-modal-secondary" onClick={include}>Inclure comme compte distinct</button></div>
      </div>
    </Modal>
    <Modal open={dialog === 'import'} title="Importer un relevé PEA" onClose={close} wide initialFocus="textarea">
      <div className="app-modal-content">
        <ol className="app-wizard-steps" aria-label="Étapes de l’import">{steps.map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined}><span>{index + 1}</span> {label}</li>)}</ol>
        {step === 0 && <>
          <p>Collez un tableau Fortuneo ou chargez un fichier CSV. Un relevé partiel conserve les positions absentes ; un relevé complet les remplace toutes et requiert les espèces.</p>
          <div className="local-form"><label>Fichier CSV<input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={(event) => { const file = event.target.files?.[0]; if (file) file.text().then((contents) => { setText(contents); setPreview(null); }).catch((failure) => { event.target.setCustomValidity(failure.message); event.target.reportValidity(); }); }}/></label><label>Séparateur<select value={delimiter} onChange={(event) => { setDelimiter(event.target.value); setPreview(null); }}><option value=";">Point virgule</option><option value=",">Virgule</option><option value={'\t'}>Tabulation</option></select></label><label>Date du relevé<input type="date" value={asOf} onChange={(event) => { setAsOf(event.target.value); setPreview(null); }}/></label><label>Nature du relevé<select value={mode} onChange={(event) => { setMode(event.target.value); setPreview(null); }}><option value="complete">Complet</option><option value="partial">Partiel</option></select></label><label>Espèces sur le PEA (€)<input inputMode="decimal" placeholder={mode === 'complete' ? 'Obligatoire' : 'Vide = inchangé'} value={cash} onChange={(event) => { setCash(event.target.value); setPreview(null); }}/></label></div>
          <label className="local-wide-label">Coller le tableau<textarea rows="7" value={text} onChange={(event) => { setText(event.target.value); setPreview(null); }} placeholder={'ISIN;Libellé;Quantité;Valorisation\nFR0000000001;ETF fictif;2;120,50'}/></label>
          <p className="local-import-hint">Pour Fortuneo, collez le tableau Excel avec ses en-têtes. Les espèces resteront inchangées.</p>
          <div className="app-modal-actions"><button type="button" className="app-modal-secondary" onClick={close}>Annuler</button><button type="button" disabled={!text.trim()} onClick={previewFortuneo}>Tableau Fortuneo → aperçu</button><button type="button" disabled={!text.trim()} onClick={() => setStep(1)}>Tableau générique → colonnes</button></div>
        </>}
        {step === 1 && <>
          <p>Associez les colonnes de votre tableau aux données du PEA. ISIN et valorisation sont obligatoires.</p>
          <div className="local-form">{[['isin', 'ISIN *'], ['label', 'Libellé'], ['quantity', 'Quantité'], ['value', 'Valorisation *'], ['price', 'Cours indicatif']].map(([field, label]) => <label key={field}>{label}<select value={columns[field]} onChange={(event) => change(field, event.target.value)}><option value="">Choisir…</option>{headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div>
          <div className="app-modal-actions"><button type="button" className="app-modal-secondary" onClick={() => setStep(0)}>← Retour</button><button type="button" disabled={!columns.isin || !columns.value} onClick={previewImport}>Prévisualiser le relevé</button></div>
        </>}
        {step === 2 && preview && <>
          <div className="local-preview"><strong>{preview.data.positions.length} ligne(s) · {preview.payload.mode === 'partial' && preview.payload.cash_eur === '' ? 'total des lignes importées' : 'total du relevé'} {euro(preview.data.total_eur)}</strong><p>{preview.data.incomplete} ligne(s) sans quantité. {preview.data.positions.filter((row) => !known.has(row.isin)).length} hors catalogue. {preview.payload.mode === 'partial' ? 'Les lignes absentes restent présentes.' : 'Les lignes absentes seront retirées.'}</p><div className="local-table-wrap"><table><thead><tr><th>ISIN</th><th>Quantité</th><th>Valorisation</th></tr></thead><tbody>{preview.data.positions.map((row) => <tr key={row.isin}><td>{row.isin}</td><td>{row.quantity ?? 'Inconnue'}</td><td>{euro(row.value_cents / 100)}</td></tr>)}</tbody></table></div></div>
          <div className="app-modal-actions"><button type="button" className="app-modal-secondary" onClick={() => setStep(importOrigin === 'fortuneo' ? 0 : 1)}>← Retour</button><button type="button" onClick={commitImport}>Confirmer ce relevé</button></div>
        </>}
        {error && <p role="alert" className="app-modal-error">{error}</p>}
      </div>
    </Modal>
  </>;
}
