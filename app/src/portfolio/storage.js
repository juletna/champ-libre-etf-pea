import { validateRoles } from './portrait.js';
import { CASH_ISIN, validateSavedModels } from '../allocation/engine.js';

export const WORKSPACE_KEY = 'champ-libre.workspace.v1';
export const LEGACY_MODELS_KEY = 'champ-libre.allocation-models.v1';
export const MAX_BASKETS = 30;
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const total = (weights) => Object.values(weights).reduce((sum, w) => sum + w, 0);
const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const ids = (values, funds) => Array.isArray(values) ? [...new Set(values.filter((id) => typeof id === 'string' && Object.hasOwn(funds, id)))] : [];

export function validateWeights(value, funds) {
  if (!isObject(value)) return null;
  const entries = Object.entries(value).filter(([id]) => Object.hasOwn(funds, id));
  if (entries.some(([, w]) => !finite(w, 0, 100))) return null;
  const weights = Object.fromEntries(entries);
  return total(weights) <= 100.00001 ? weights : null;
}

export function validateDraft(value, model) {
  if (!isObject(value) || !isObject(value.settings)) return null;
  const s = value.settings;
  const base = validateWeights(value.base, model.funds);
  const locks = validateWeights(s.locks, model.funds);
  if (!base || !locks || !finite(s.conviction, 0, 100) || !finite(s.equity, 0, 100)
    || ![1, 2, 3, 4, 5, 6, 8, 10].includes(s.maxFunds) || !isObject(s.intent)) return null;
  const intent = {};
  for (const [kind, names] of [['zones', model.zoneNames], ['sectors', model.sectorNames]]) {
    if (!isObject(s.intent[kind])) return null;
    const values = Object.fromEntries(names.map((name) => [name, s.intent[kind][name] ?? 0]));
    if (Object.values(values).some((n) => !finite(n, 0, 100)) || Math.abs(total(values) - 100) > 0.01) return null;
    intent[kind] = values;
  }
  const settings = {
    intent, conviction: s.conviction, equity: s.equity, maxFunds: s.maxFunds, locks,
    zoneLocks: Array.isArray(s.zoneLocks) ? [...new Set(s.zoneLocks.filter((name) => model.zoneNames.includes(name)))] : [],
    minSize: finite(s.minSize, 0, 1e15) ? s.minSize : 0,
    maxFee: s.maxFee !== '' && finite(Number(s.maxFee), 0, 10) ? String(s.maxFee) : '',
    distribution: ['capitalisation', 'distribution'].includes(s.distribution) ? s.distribution : '',
    hedging: s.hedging === 'exclude' ? 'exclude' : 'any', excluded: ids(s.excluded, model.funds),
  };
  let manual = validateWeights(value.manual, model.funds);
  if (manual && (Math.abs(total(manual) - 100) > 0.01
    || Math.abs((manual[CASH_ISIN] || 0) - (100 - settings.equity)) > 0.01
    || Object.values(manual).filter((w) => w > 0).length > settings.maxFunds
    || Object.entries(locks).some(([id, w]) => Math.abs((manual[id] || 0) - w) > 0.01))) manual = null;
  return { step: [0, 1, 2].includes(value.step) ? value.step : 0,
    source: typeof value.source === 'string' ? value.source.slice(0, 80) : 'current', base, settings,
    anchor: { weights: validateWeights(value.anchor?.weights, model.funds) || base, lockedIsins: ids(value.anchor?.lockedIsins || Object.keys(locks), model.funds) },
    manual, selectedVariant: [0, 1, 2].includes(value.selectedVariant) ? value.selectedVariant : 0,
    targetKind: value.targetKind === 'sectors' ? 'sectors' : 'zones' };
}

export function validateSnapshot(value, model) {
  if (!isObject(value)) return null;
  const weights = validateWeights(value.weights, model.funds);
  if (!weights) return null;
  const selectedIsins = [...new Set([...ids(value.selectedIsins, model.funds), ...Object.keys(weights).filter((id) => weights[id] > 0)])];
  const selected = new Set(selectedIsins);
  const filters = isObject(value.filters) ? value.filters : {};
  return {
    weights: Object.fromEntries(selectedIsins.map((id) => [id, weights[id] || 0])), selectedIsins,
    lockedIsins: ids(value.lockedIsins, model.funds).filter((id) => selected.has(id)),
    visibleEtfIsins: ids(value.visibleEtfIsins, model.funds).filter((id) => selected.has(id)),
    period: [12, 36, 60, 'max'].includes(value.period) ? value.period : 36,
    geoView: value.geoView === 'zones' ? 'zones' : 'countries',
    hasBuiltAllocation: value.hasBuiltAllocation === true,
    editorView: value.editorView === 'basket' ? 'basket' : 'catalog',
    filters: {
      query: typeof filters.query === 'string' ? filters.query.slice(0, 200) : '',
      category: typeof filters.category === 'string' ? filters.category.slice(0, 80) : '',
      distribution: ['capitalisation', 'distribution'].includes(filters.distribution) ? filters.distribution : '',
      minSize: [0, 100e6, 500e6, 1e9].includes(filters.minSize) ? filters.minSize : 0,
      maxFee: ['', '0.2', '0.3', '0.5'].includes(filters.maxFee) ? filters.maxFee : '',
      fullHistory: filters.fullHistory === true,
      sort: ['performance-desc', 'performance-asc', 'size-desc', 'size-asc', 'fee-asc', 'fee-desc', 'name'].includes(filters.sort) ? filters.sort : 'performance-desc',
    },
    portraitRoles: Object.fromEntries(Object.entries(validateRoles(value.portraitRoles, model.funds)).filter(([id]) => selected.has(id))),
    wizardDraft: validateDraft(value.wizardDraft, model),
  };
}

export function readWorkspace(storage, model, fallback) {
  const empty = { current: validateSnapshot(fallback, model), baskets: [], activeId: '', error: '' };
  try {
    const raw = storage.getItem(WORKSPACE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data?.version !== 1) return { ...empty, error: 'Version de sauvegarde non reconnue. Vos données locales n’ont pas été modifiées.' };
      const seen = new Set();
      const baskets = (Array.isArray(data.baskets) ? data.baskets : []).flatMap((entry) => {
        if (!entry || typeof entry.id !== 'string' || !entry.id || seen.has(entry.id) || typeof entry.name !== 'string' || !entry.name.trim()) return [];
        const snapshot = validateSnapshot(entry.snapshot, model);
        if (!snapshot) return [];
        seen.add(entry.id);
        return [{ id: entry.id.slice(0, 80), name: entry.name.trim().slice(0, 60), snapshot }];
      }).slice(0, MAX_BASKETS);
      const current = validateSnapshot(data.current, model);
      return { current: current || empty.current, baskets, activeId: baskets.some((b) => b.id === data.activeId) ? data.activeId : '', error: current ? '' : 'Le dernier brouillon est illisible. Les paniers valides restent disponibles.' };
    }
    const legacy = validateSavedModels(JSON.parse(storage.getItem(LEGACY_MODELS_KEY)), model.funds);
    return { ...empty, baskets: legacy.map((entry) => ({ id: entry.id, name: entry.name, snapshot: validateSnapshot({ ...fallback, weights: entry.weights, selectedIsins: Object.keys(entry.weights), lockedIsins: [], visibleEtfIsins: [] }, model) })) };
  } catch {
    return { ...empty, error: 'Lecture du stockage local impossible. Le brouillon fonctionne en mémoire.' };
  }
}

export function writeWorkspace(storage, current, baskets, activeId) {
  try {
    storage.setItem(WORKSPACE_KEY, JSON.stringify({ version: 1, current, baskets, activeId }));
    return true;
  } catch { return false; }
}
