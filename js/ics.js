// Export .ics (Google Calendar, Apple, Outlook): gli esami scelti all'ora dell'appello e, per quelli non ancora
// prenotati, apertura e scadenza della prenotazione come eventi di tutto il giorno.
import { addDays } from './date.js';
import { appelloScelto } from './pianifica.js';

const esc = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const d8 = d => d.replace(/-/g, '');
/** Righe lunghe spezzate (il formato vuole al massimo 75 byte; con accenti ed emoji si sta più bassi). */
const fold = l => (l.length <= 60 ? l : l.match(/.{1,50}/gu).join('\r\n '));

export function creaIcs(state, adesso = new Date()) {
  const stamp = adesso.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ev = [];
  const evento = (uid, campi) => ev.push('BEGIN:VEVENT', `UID:${uid}@gauni`, `DTSTAMP:${stamp}`, ...campi, 'END:VEVENT');
  for (const e of state.esami) {
    const a = appelloScelto(e);
    if (!a || e.esito) continue;
    const [h, m] = (a.ora || '09:00').split(':').map(Number);
    const ini = `${d8(a.data)}T${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}00`;
    const fine = `${d8(a.data)}T${String(Math.min(23, h + 3)).padStart(2, '0')}${String(m).padStart(2, '0')}00`;
    evento(`esame-${a.id}`, [
      `DTSTART;TZID=Europe/Rome:${ini}`, `DTEND;TZID=Europe/Rome:${fine}`,
      `SUMMARY:${esc(`📚 Esame: ${e.nome}`)}`,
      `DESCRIPTION:${esc([`${e.cfu} CFU`, e.codice, a.tipo, a.modalita].filter(Boolean).join(' · '))}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`Domani: ${e.nome}`)}`, 'TRIGGER:-P1D', 'END:VALARM',
    ]);
    if (a.prenotato) continue;
    if (a.aperturaPren) evento(`apre-${a.id}`, [`DTSTART;VALUE=DATE:${d8(a.aperturaPren)}`, `DTEND;VALUE=DATE:${d8(addDays(a.aperturaPren, 1))}`, `SUMMARY:${esc(`🟢 Aprono le prenotazioni: ${e.nome}`)}`]);
    if (a.chiusuraPren) evento(`chiude-${a.id}`, [`DTSTART;VALUE=DATE:${d8(a.chiusuraPren)}`, `DTEND;VALUE=DATE:${d8(addDays(a.chiusuraPren, 1))}`, `SUMMARY:${esc(`⏰ Ultimo giorno per prenotare: ${e.nome}`)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`Prenota ${e.nome}`)}`, 'TRIGGER:-PT12H', 'END:VALARM']);
  }
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GAUNI//Esami//IT', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Esami (GAUNI)',
    ...ev, 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
}
