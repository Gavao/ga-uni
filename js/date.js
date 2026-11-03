// Date "di calendario" senza fuso orario: sempre stringhe 'YYYY-MM-DD'. I conti si fanno a mezzogiorno UTC,
// così l'ora legale non sposta mai un giorno.
const MS = 86400000;
const toUTC = d => { const [y, m, g] = d.split('-').map(Number); return Date.UTC(y, m - 1, g, 12); };
const fromUTC = t => new Date(t).toISOString().slice(0, 10);

/** Oggi, secondo l'orologio del telefono. */
export function today(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export const addDays = (d, n) => fromUTC(toUTC(d) + n * MS);
/** Giorni da a fino a b (b − a). */
export const diffDays = (a, b) => Math.round((toUTC(b) - toUTC(a)) / MS);
/** Giorno della settimana: 0 lunedì … 6 domenica. */
export const weekday = d => (new Date(toUTC(d)).getUTCDay() + 6) % 7;
export const isValid = d => /^\d{4}-\d{2}-\d{2}$/.test(d ?? '') && fromUTC(toUTC(d)) === d;

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const GIORNI = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
export const MESI_BREVI = MESI.map(m => m.slice(0, 3));
export const GIORNI_BREVI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
export const monthName = m => MESI[m];

/** 05/11 */
export const ddmm = d => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
/** 05/11/2026 */
export const ddmmyyyy = d => `${ddmm(d)}/${d.slice(0, 4)}`;
/** giovedì 5 novembre 2026 */
export const longDate = (d, year = true) => `${GIORNI[weekday(d)]} ${+d.slice(8, 10)} ${MESI[+d.slice(5, 7) - 1]}${year ? ` ${d.slice(0, 4)}` : ''}`;
/** gio 5 nov */
export const shortDate = d => `${GIORNI_BREVI[weekday(d)].toLowerCase()} ${+d.slice(8, 10)} ${MESI_BREVI[+d.slice(5, 7) - 1]}`;
/** "oggi", "domani", "tra 12 giorni", "3 giorni fa" */
export function relDays(from, to) {
  const n = diffDays(from, to);
  if (n === 0) return 'oggi';
  if (n === 1) return 'domani';
  if (n === -1) return 'ieri';
  return n > 0 ? `tra ${n} giorni` : `${-n} giorni fa`;
}
