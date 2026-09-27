import { WORKSPACE_KEY, LEGACY_MODELS_KEY } from '../portfolio/storage.js';
import { MIGRATION_KEY } from '../migration/engine.js';
import { validateMigration } from '../migration/engine.js';
import { validateSnapshot } from '../portfolio/storage.js';
import { validateSavedModels } from '../allocation/engine.js';
import { createAllocationModel } from '../allocation/engine.js';
import { geographicZone } from '../allocation/geography.js';
import profilesData from '../data/mvp-profiles.json';
import catalogData from '../etf_pea_fortuneo_amundi.json';
import pricesData from '../data/mvp-prices.json';
import fundSizesData from '../data/mvp-fund-sizes.json';

const allocationModel = createAllocationModel({
  profiles: profilesData.etfs, catalog: catalogData.etf,
  prices: pricesData.par_isin, sizes: fundSizesData.par_isin, geographicZone,
});

const KEYS = [WORKSPACE_KEY, MIGRATION_KEY, LEGACY_MODELS_KEY];

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
  if (!local) return { local: false, storage: window.localStorage };
  const loaded = await (await request('/api/browser-data')).json();
  const cache = new Map(Object.entries(loaded.entries));
  let pending = Promise.resolve();
  let lastError = null;
  const storage = {
    getItem: (key) => cache.get(key) ?? null,
    setItem: (key, value) => {
      if (!KEYS.includes(key)) throw new Error('Clé inconnue');
      cache.set(key, value);
      pending = pending.then(() => request('/api/browser-data', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 1, entries: { [key]: value } }),
      })).then(() => { lastError = null; }).catch((error) => { lastError = error; window.dispatchEvent(new CustomEvent('local-save-error', { detail: error.message })); });
    },
    flush: async () => { await pending; if (lastError) throw lastError; },
    reload: async () => { const data = await (await request('/api/browser-data')).json(); cache.clear(); Object.entries(data.entries).forEach(([key, value]) => cache.set(key, value)); },
  };
  return { local: true, storage };
}

export function browserExport() {
  const entries = Object.fromEntries(KEYS.flatMap((key) => {
    const raw = window.localStorage.getItem(key);
    return raw == null ? [] : [[key, raw]];
  }));
  return { version: 1, entries };
}

export async function importBrowser(storage, file) {
  const data = JSON.parse(await file.text());
  if (data.version !== 1 || !data.entries || Array.isArray(data.entries) || typeof data.entries !== 'object') throw new Error('Export navigateur invalide.');
  const entries = data.entries;
  if (Object.keys(entries).length === 0) throw new Error('Aucune donnée à importer. Exportez depuis le navigateur et l’origine qui détiennent les données.');
  if (entries[WORKSPACE_KEY]) {
    const workspace = JSON.parse(entries[WORKSPACE_KEY]);
    if (workspace.version !== 1 || !validateSnapshot(workspace.current, allocationModel) || !Array.isArray(workspace.baskets)
      || workspace.baskets.some((basket) => !basket.id || !basket.name || !validateSnapshot(basket.snapshot, allocationModel))) throw new Error('Paniers ou brouillon invalides.');
  }
  if (entries[MIGRATION_KEY]) {
    const migration = JSON.parse(entries[MIGRATION_KEY]);
    if (migration.version !== 1 || !validateMigration(migration.data, allocationModel.funds)) throw new Error('Portefeuille réel invalide.');
  }
  if (entries[LEGACY_MODELS_KEY]) {
    const legacy = JSON.parse(entries[LEGACY_MODELS_KEY]);
    if (legacy.version !== 1 || !Array.isArray(legacy.models) || validateSavedModels(legacy, allocationModel.funds).length !== legacy.models.length) throw new Error('Anciens modèles invalides.');
  }
  await storage.flush();
  await request('/api/browser-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  await storage.reload();
}

export async function downloadBackup(storage) {
  await storage.flush();
  const response = await request('/api/backup.sqlite');
  downloadBlob(await response.blob(), 'champ-libre-backup.sqlite');
}

export async function downloadJson(storage) {
  await storage.flush();
  const response = await request('/api/export.json');
  downloadBlob(await response.blob(), 'champ-libre-export.json');
}

export async function restoreBackup(storage, file) {
  await storage.flush();
  const response = await request('/api/restore.sqlite', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: await file.arrayBuffer() });
  return response.json();
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
