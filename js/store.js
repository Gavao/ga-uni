// Stato dell'app salvato nel telefono (localStorage), con backup in JSON.
import { SEED } from './seed.js';
import { leggiImport, unisci } from './importa.js';

const KEY = 'gauni';
export const IMPOSTAZIONI = { oreGiorno: 4, giorni: [0, 1, 2, 3, 4, 5], pause: [], giorniRipasso: 3 };

/** Stato nuovo con gli esami di partenza. */
export function statoIniziale() {
  const state = { versione: 1, esami: [], impostazioni: structuredClone(IMPOSTAZIONI), piano: null, fatti: [] };
  unisci(state, leggiImport(JSON.stringify(SEED)).esami);
  return state;
}
export function carica() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (s?.versione) return migra(s);
  } catch { /* dati rovinati: si riparte */ }
  return null;
}
export function salva(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* spazio pieno o modalità privata */ }
}
function migra(s) {
  s.impostazioni = { ...IMPOSTAZIONI, ...s.impostazioni };
  s.fatti ??= [];
  for (const e of s.esami) { e.argomenti ??= []; e.oreCfu ??= 25; e.giaStudiato ??= 0; }
  return s;
}
/** Backup: tutto lo stato, leggibile. */
export const backup = state => JSON.stringify({ app: 'GAUNI', salvatoIl: new Date().toISOString(), ...state }, null, 1);
export function ripristina(testo) {
  const s = JSON.parse(testo);
  if (!s?.versione || !Array.isArray(s.esami)) throw new Error('Questo file non è un backup di GAUNI.');
  delete s.app; delete s.salvatoIl;
  return migra(s);
}
