// Stato dell'app salvato nel telefono (localStorage), con backup in JSON.
import { SEED } from './seed.js';
import { leggiImport, unisci, arricchisciPegaso } from './importa.js';

const KEY = 'gauni';
export const IMPOSTAZIONI = { oreGiorno: 4, giorni: [0, 1, 2, 3, 4, 5], pause: [], giorniRipasso: 3, unoAllaVolta: true };

/** Stato nuovo con gli esami di partenza. */
export function statoIniziale() {
  const state = { versione: 1, esami: [], impostazioni: structuredClone(IMPOSTAZIONI), piano: null, fatti: [] };
  unisci(state, leggiImport(JSON.stringify(SEED)).esami);
  arricchisciPegaso(state);
  return state;
}
export function carica() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (s?.versione) {
      const vecchio = !!s.pegaso?.schede;
      migra(s);
      if (vecchio) salva(s);   // libera subito lo spazio delle schede non più usate
      return s;
    }
  } catch { /* dati rovinati: si riparte */ }
  return null;
}
export function salva(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* spazio pieno o modalità privata */ }
}
function migra(s) {
  s.impostazioni = { ...IMPOSTAZIONI, ...s.impostazioni };
  s.fatti ??= [];
  if (s.pegaso) delete s.pegaso.schede;   // schede di ripasso di una versione precedente: non più usate
  for (const e of s.esami) { e.argomenti ??= []; e.oreCfu ??= 25; e.giaStudiato ??= 0; }
  arricchisciPegaso(s);   // lezioni Pegaso e piano di studi completo, anche sulle partite già iniziate
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
