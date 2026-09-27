const normalized = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

function roundedEuros(raw, line) {
  const clean = raw.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(clean)) throw new Error(`Ligne ${line} : valorisation invalide.`);
  const [whole, fraction = ''] = clean.split('.');
  const cents = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2)) + (Number(fraction[2] || 0) >= 5 ? 1n : 0n);
  if (cents > 100000000000000000n) throw new Error(`Ligne ${line} : valorisation trop élevée.`);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

export function prepareFortuneo(text) {
  const lines = text.replace(/^\ufeff/, '').split(/\r?\n/).map((line) => line.split('\t').map((cell) => cell.trim()));
  const headerIndex = lines.findIndex((line) => ['libelle', 'qte', 'valorisation', 'isin'].every((name) => line.some((cell) => normalized(cell) === name)));
  if (headerIndex < 0) throw new Error('Collez le tableau Fortuneo avec les en-têtes Libellé, Qté, Valorisation et ISIN.');
  const headers = lines[headerIndex].map(normalized);
  const indexes = ['isin', 'libelle', 'qte', 'valorisation'].map((name) => headers.indexOf(name));
  const seen = new Set();
  const result = ['ISIN\tLibellé\tQuantité\tValorisation'];
  for (const [offset, row] of lines.slice(headerIndex + 1).entries()) {
    const [isin, label, quantity, value] = indexes.map((index) => row[index] || '');
    if (!isin && !label && !quantity && !value) continue;
    if (!isin && /^(total|valorisation)/i.test(label)) continue;
    const line = headerIndex + offset + 2;
    if (!/^[A-Za-z]{2}[A-Za-z0-9]{10}$/.test(isin) || !label || !quantity || !value || seen.has(isin.toUpperCase())) {
      throw new Error(`Ligne ${line} : ISIN, libellé, quantité ou valorisation manquant ou dupliqué.`);
    }
    seen.add(isin.toUpperCase());
    result.push([isin.toUpperCase(), label, quantity, roundedEuros(value, line)].join('\t'));
  }
  if (result.length === 1) throw new Error('Aucune position Fortuneo trouvée.');
  return {text: result.join('\n'), count: result.length - 1};
}
