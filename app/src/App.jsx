import { useEffect, useRef, useState } from 'react';
import PortfolioMvp from './PortfolioMvp.jsx';
import Household from './local/Household.jsx';
import Pea from './local/Pea.jsx';
import Cap from './local/Cap.jsx';
import NextInvestment from './local/NextInvestment.jsx';
import { downloadBackup, restoreBackup } from './local/bridge.js';

export default function App({ local, storage }) {
  const [message, setMessage] = useState('');
  const [view, setView] = useState(local ? 'overview' : 'catalog');
  const restoreRef = useRef(null);
  useEffect(() => {
    const listener = (event) => setMessage(`Échec de l'enregistrement local : ${event.detail}`);
    window.addEventListener('local-save-error', listener);
    return () => window.removeEventListener('local-save-error', listener);
  }, []);
  async function action(work) {
    setMessage('');
    try { await work(); } catch (error) { setMessage(error.message); }
  }
  return <>
    <nav className="local-tools" aria-label="Données et sauvegardes">
      {local && <><button type="button" aria-current={view === 'overview' ? 'page' : undefined} onClick={() => setView('overview')}>Vue d’ensemble</button><button type="button" aria-current={view === 'cap' ? 'page' : undefined} onClick={() => setView('cap')}>Mon cap</button><button type="button" aria-current={view === 'pea' ? 'page' : undefined} onClick={() => setView('pea')}>Mon PEA</button><button type="button" aria-current={view === 'investment' ? 'page' : undefined} onClick={() => setView('investment')}>Prochain investissement</button><button type="button" aria-current={view === 'catalog' ? 'page' : undefined} onClick={() => setView('catalog')}>Catalogue et analyses ETF</button></>}
      {local && <>
        <button type="button" onClick={() => action(() => downloadBackup(storage))}>Sauvegarde SQLite</button>
        <button type="button" onClick={() => restoreRef.current.click()}>Restaurer SQLite</button>
        <input ref={restoreRef} type="file" accept=".sqlite,application/vnd.sqlite3" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) action(async () => { const result = await restoreBackup(storage, file); setMessage(`Base restaurée. Copie de sécurité précédente : ${result.previous_backup}. Rechargez la page.`); window.location.reload(); }); }}/>
      </>}
    </nav>
    {message && <p className="local-message" role="alert">{message}</p>}
    {local && view === 'overview' ? <Household openPea={() => setView('pea')}/> : local && view === 'cap' ? <Cap storage={storage} openCatalog={() => setView('catalog')}/> : local && view === 'pea' ? <Pea/> : local && view === 'investment' ? <NextInvestment openCap={() => setView('cap')} openPea={() => setView('pea')}/> : <PortfolioMvp storage={storage} local={local} onOpenInvestment={() => setView('investment')}/>}
  </>;
}
