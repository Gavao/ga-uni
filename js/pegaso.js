// Università Telematica Pegaso: com'è fatto un esame. L'elenco delle videolezioni di ogni insegnamento e
// l'avanzamento personale arrivano con l'import dei dati (file privato, resta solo nel telefono).

/** Regole d'esame A.A. 2026/27 (avviso "Specifiche sulle modalità di svolgimento delle prove"). */
export const REGOLE = {
  frequenza: 70,   // % di frequenza alle videolezioni per poter prenotare una prova
  intermedia: { domande: 24, minuti: 35, minimo: 15, validita: 365 },
  finale: { domande: 7, minuti: 15 },
  unica: { domande: 31, minuti: 45 },
  premiali: 2,     // punti massimi dalla didattica sincrona (lezioni in diretta), sommati alla prova intermedia
};
/** Lezioni escluse dalla prova intermedia (e chieste alla prova finale): le ultime 10, o 5 fino a 4 CFU. */
export const lezioniFinale = cfu => (cfu >= 5 ? 10 : 5);

/** "100x5,40x15,20" → [100,100,100,100,100,40,…,20] */
export function espandi(rle) {
  return String(rle ?? '').split(',').filter(Boolean).flatMap(p => { const [v, n] = p.split('x').map(Number); return Array(n || 1).fill(v); });
}

/** Frequenza alle videolezioni: quella ufficiale se importata, altrimenti la media di quanto visto (lezioni finite = 100%). */
export function frequenza(e) {
  if (!e.lezioni?.length) return null;
  if (e.frequenza == null && !e.lezioni.some(l => l.visto || l.fattoIl)) return null;   // non ancora importata: sconosciuta
  const media = Math.round(e.lezioni.reduce((a, l) => a + (l.fattoIl ? 100 : l.visto ?? 0), 0) / e.lezioni.length);
  return Math.max(e.frequenza ?? 0, media);
}
