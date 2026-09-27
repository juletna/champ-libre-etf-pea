import { WORKSPACE_KEY } from '../portfolio/storage.js';

const KEYS = [WORKSPACE_KEY];

export async function request(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', ...options, headers: { 'X-Champ-Local': '1', ...options.headers } });
  if (!response.ok) {
    let message = `Erreur HTTP ${response.status}`;
    try { message = (await response.json()).error || message; } catch { /* binary response */ }
    throw new Error(message);
  }
  return response;
}

export async function loadContext() {
  let local = false;
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    local = response.ok && (await response.json()).local === true;
  } catch { /* public static site */ }
  if (!local) {
    const draft = new Map();
    return { local: false, storage: {
      getItem: (key) => draft.get(key) ?? null,
      setItem: (key, value) => draft.set(key, value),
    } };
  }
  const loaded = await (await request('/api/workspace')).json();
  const cache = new Map(Object.entries(loaded.entries));
  let pending = Promise.resolve();
  let queued = 0;
  let lastError = null;
  window.addEventListener('beforeunload', (event) => {
    if (!queued && !lastError) return;
    event.preventDefault();
    event.returnValue = '';
  });
  const storage = {
    getItem: (key) => cache.get(key) ?? null,
    setItem: (key, value) => {
      if (!KEYS.includes(key)) throw new Error('Clé inconnue');
      cache.set(key, value);
      queued += 1;
      pending = pending.then(() => request('/api/workspace', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 1, entries: { [key]: value } }),
      })).then(() => { lastError = null; }).catch((error) => {
        lastError = error;
        window.dispatchEvent(new CustomEvent('local-save-error', { detail: error.message }));
      }).finally(() => {
        queued -= 1;
        if (!queued && !lastError) window.dispatchEvent(new Event('local-save-success'));
      });
    },
    flush: async () => { await pending; if (lastError) throw lastError; },
  };
  return { local: true, storage };
}

export async function downloadBackup(storage) {
  await storage.flush();
  const response = await request('/api/backup.sqlite');
  downloadBlob(await response.blob(), 'champ-libre-backup.sqlite');
}

export async function restoreBackup(storage, file) {
  await storage.flush();
  const response = await request('/api/restore.sqlite', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: await file.arrayBuffer() });
  return response.json();
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
