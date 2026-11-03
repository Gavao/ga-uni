// Prove automatiche di import, scelta degli appelli, piano di studio ed export .ics. Si aprono da tests.html.
import { leggiImport, unisci, leggiArgomenti, nuovoEsame } from './importa.js';
import { proponiAppelli, avvisi, carriera, statoPrenotazione } from './esami.js';
import { pianifica, ripianifica, segnaFatto, capacita, oreTotali, QUOTE, appelloScelto } from './pianifica.js';
import { creaIcs } from './ics.js';
import { statoIniziale } from './store.js';
import { addDays, diffDays, weekday } from './date.js';
import { SEED } from './seed.js';

const risultati = [];
function test(nome, fn) {
  try { fn(); risultati.push([true, nome]); } catch (e) { risultati.push([false, nome, e.message]); }
}
const ok = (v, msg) => { if (!v) throw new Error(msg ?? 'atteso vero'); };
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg ?? ''} atteso ${JSON.stringify(b)}, trovato ${JSON.stringify(a)}`); };
const vicino = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg ?? ''} atteso ~${b}, trovato ${a}`);
const OGGI = '2026-11-03';

/** Stato di prova: esami semplici con un appello ciascuno (scelto). */
function stato(esami, imp = {}) {
  const s = { versione: 1, esami: [], impostazioni: { oreGiorno: 4, giorni: [0, 1, 2, 3, 4, 5, 6], pause: [], giorniRipasso: 3, ...imp }, piano: null, fatti: [] };
  esami.forEach((e, i) => {
    const x = nuovoEsame({ nome: e.nome ?? `Esame ${i + 1}`, cfu: e.cfu ?? 6, appelli: (e.date ?? [e.data]).map(d => ({ data: d, ora: '09:30', aperturaPren: addDays(d, -20), chiusuraPren: addDays(d, -2) })) }, '#fff');
    x.oreCfu = e.oreCfu ?? 25;
    if (e.argomenti) x.argomenti = leggiArgomenti(e.argomenti);
    x.scelta = x.appelli[0].id;
    s.esami.push(x);
  });
  return s;
}

// ---------------------------------------------------------------- import
test('import: il JSON di partenza dà 10 esami e 29 appelli', () => {
  const { esami, errori } = leggiImport(JSON.stringify(SEED));
  eq(errori, []);
  eq(esami.length, 10);
  eq(esami.reduce((a, e) => a + e.appelli.length, 0), 29);
  eq(esami.reduce((a, e) => a + e.cfu, 0), 84);
});
test('import: accetta il JSON dentro un blocco ```json con testo intorno', () => {
  const t = 'Ecco il JSON:\n```json\n{"esami":[{"nome":"Algebra","codice":"X1","cfu":6,"appelli":[{"data":"2027-09-20","ora":"9:30"}]}]}\n```\nFatto.';
  const { esami, errori } = leggiImport(t);
  eq(errori, []);
  eq(esami[0].appelli[0].ora, '09:30');
});
test('import: appelli dello stesso codice raggruppati, doppioni tolti, "(12 cfu)" tolto dal nome', () => {
  const t = JSON.stringify({ esami: [
    { nome: 'Reti (12 cfu)', codice: 'abc', cfu: 12, appelli: [{ data: '2027-08-26' }] },
    { nome: 'Reti', codice: 'ABC', cfu: 12, appelli: [{ data: '2027-08-23' }, { data: '2027-08-26' }] },
  ] });
  const { esami } = leggiImport(t);
  eq(esami.length, 1);
  eq(esami[0].nome, 'Reti');
  eq(esami[0].appelli.map(a => a.data), ['2027-08-23', '2027-08-26']);
});
test('import: date sbagliate segnalate, non importate', () => {
  const { esami, errori } = leggiImport('{"esami":[{"nome":"X","cfu":6,"appelli":[{"data":"2027-02-30"},{"data":"5 marzo"}]}]}');
  eq(esami.length, 0);
  ok(errori.length >= 2);
});
test('import: testo non valido → errore chiaro', () => {
  ok(leggiImport('ciao').errori[0].includes('{'));
  ok(leggiImport('{ esami: [ }').errori[0].includes('JSON'));
});
test('unisci: aggiorna appelli tenendo prenotazioni, argomenti e voto', () => {
  const s = statoIniziale();
  const ux = s.esami[0];
  ux.appelli[0].prenotato = true;
  ux.argomenti = leggiArgomenti('Usabilità\nPersonas');
  const r = unisci(s, leggiImport(JSON.stringify({ esami: [{ nome: 'User experience', codice: '0312506INGINF05IINM', cfu: 6, appelli: [{ data: '2026-11-05', ora: '10:00' }, { data: '2027-01-20' }] }] })).esami);
  eq(r, { aggiunti: 0, aggiornati: 1 });
  eq(ux.appelli.length, 3);
  eq(ux.appelli[0].prenotato, true);
  eq(ux.appelli[0].ora, '10:00');
  eq(ux.argomenti.length, 2);
});
test('argomenti incollati: elenchi numerati e difficoltà tra parentesi', () => {
  const a = leggiArgomenti('1. Ricerca A* (difficile)\n- Logica proposizionale (facile)\n• Reti bayesiane !!\n\nAgenti');
  eq(a.map(x => x.titolo), ['Ricerca A*', 'Logica proposizionale', 'Reti bayesiane', 'Agenti']);
  eq(a.map(x => x.difficolta), ['difficile', 'facile', 'difficile', 'medio']);
});

// ---------------------------------------------------------------- scelta degli appelli
test('scelta: mai due esami lo stesso giorno (Probabilità/Sicurezza, Tec. Web/Reti)', () => {
  const s = statoIniziale();
  const p = proponiAppelli(s, OGGI);
  const date = s.esami.map(e => p[e.id]).filter(x => x !== 'salta').map((id, i) => s.esami.flatMap(e => e.appelli).find(a => a.id === id).data);
  eq(new Set(date).size, date.length, 'date ripetute');
  eq(Object.values(p).filter(x => x === 'salta').length, 0, 'nessun esame saltato');
});
test('scelta: esami "gemelli" distanziati il più possibile (8 e 12 marzo, 23 e 27 agosto)', () => {
  const s = statoIniziale();
  const p = proponiAppelli(s, OGGI);
  const d = nome => s.esami.find(e => e.nome.startsWith(nome)).appelli.find(a => a.id === p[s.esami.find(e => e.nome.startsWith(nome)).id]).data;
  eq([d('Calcolo'), d('Sicurezza')].sort(), ['2027-03-08', '2027-03-12']);
  eq([d('Tecnologie Web'), d('Reti')].sort(), ['2027-08-23', '2027-08-27']);
});
test('scelta: appelli con prenotazione chiusa esclusi (a meno che prenotati)', () => {
  const s = statoIniziale();
  const ux = s.esami[0];
  const p = proponiAppelli(s, '2026-11-04');   // il 5/11 chiudeva il 3/11
  eq(p[ux.id], ux.appelli[1].id);
  ux.appelli[0].prenotato = true;
  ok([ux.appelli[0].id, ux.appelli[1].id].includes(proponiAppelli(s, '2026-11-04')[ux.id]));
});
test('scelta: le scelte fatte a mano restano', () => {
  const s = statoIniziale();
  const fia = s.esami[1];
  fia.scelta = fia.appelli[2].id; fia.sceltaManuale = true;
  eq(proponiAppelli(s, OGGI)[fia.id], fia.appelli[2].id);
});
test('scelta: se tutti gli appelli sono incompatibili, "salta"', () => {
  const s = stato([{ date: ['2027-01-10'] }, { date: ['2027-01-10'] }]);
  const p = proponiAppelli(s, OGGI);
  eq(Object.values(p).filter(x => x === 'salta').length, 1);
});

// ---------------------------------------------------------------- piano di studio
test('capacità: giorni di studio e pause', () => {
  const imp = { oreGiorno: 5, giorni: [0, 1, 2, 3, 4], pause: [{ da: '2026-12-23', a: '2027-01-06', fattore: 0 }, { da: '2026-12-15', a: '2026-12-22', fattore: 0.5 }] };
  eq(capacita(imp, '2026-11-07'), 0, 'sabato');
  eq(capacita(imp, '2026-11-09'), 5, 'lunedì');
  eq(capacita(imp, '2026-12-16'), 2.5, 'metà ritmo');
  eq(capacita(imp, '2026-12-28'), 0, 'vacanze');
});
test('piano: le ore pianificate coprono quelle previste (esame lontano)', () => {
  const s = stato([{ cfu: 6, data: '2027-03-01' }]);
  const r = pianifica(s, OGGI);
  const tot = r.blocchi.reduce((a, b) => a + b.ore, 0);
  ok(tot >= oreTotali(s.esami[0]) * (1 - QUOTE.finale) - 1, `ore ${tot}`);
  eq(r.mancanti, {});
});
test('piano: nessun giorno oltre le ore disponibili', () => {
  const s = statoIniziale();
  s.impostazioni.oreGiorno = 5;
  const r = pianifica(s, OGGI);
  const per = {};
  for (const b of r.blocchi) per[b.giorno] = (per[b.giorno] ?? 0) + b.ore;
  for (const [d, h] of Object.entries(per)) ok(h <= capacita(s.impostazioni, d) + 1e-9, `${d}: ${h} h`);
});
test('piano: niente studio nei giorni di pausa né nei giorni esclusi', () => {
  const s = stato([{ cfu: 9, data: '2027-02-15' }], { giorni: [0, 1, 2, 3, 4], pause: [{ da: '2026-12-23', a: '2027-01-06', fattore: 0 }] });
  const r = pianifica(s, OGGI);
  for (const b of r.blocchi) {
    ok(weekday(b.giorno) < 5, `weekend ${b.giorno}`);
    ok(!(b.giorno >= '2026-12-23' && b.giorno <= '2027-01-06'), `pausa ${b.giorno}`);
  }
});
test('piano: ultimi 3 giorni solo ripasso generale', () => {
  const s = stato([{ cfu: 6, data: '2027-02-01' }]);
  const r = pianifica(s, OGGI);
  for (const b of r.blocchi.filter(b => b.giorno >= '2027-01-29')) eq(b.tipo, 'finale', b.giorno);
  ok(r.blocchi.some(b => b.tipo === 'finale'));
});
test('piano: almeno una simulazione d\'esame, prima del ripasso finale', () => {
  const s = stato([{ cfu: 6, data: '2027-02-01' }]);
  const sim = pianifica(s, OGGI).blocchi.filter(b => b.tipo === 'simulazione');
  ok(sim.length >= 1);
  ok(sim.every(b => b.giorno < '2027-01-29'));
});
test('piano: argomenti difficili hanno più ore dei facili', () => {
  const s = stato([{ cfu: 6, data: '2027-03-01', argomenti: 'A (facile)\nB (difficile)\nC (medio)' }]);
  const ore = id => pianifica(s, OGGI).blocchi.filter(b => b.tipo === 'studio' && b.argomentoId === id).reduce((a, b) => a + b.ore, 0);
  const [a, b] = s.esami[0].argomenti;
  ok(ore(b.id) > ore(a.id) * 1.8, `difficile ${ore(b.id)} vs facile ${ore(a.id)}`);
});
test('piano: ripassi a distanza crescente dopo aver finito un argomento', () => {
  const s = stato([{ cfu: 6, data: '2027-03-01', argomenti: 'A\nB\nC\nD' }]);
  const bl = pianifica(s, OGGI).blocchi;
  const a = s.esami[0].argomenti[0].id;
  const fine = bl.filter(b => b.tipo === 'studio' && b.argomentoId === a).map(b => b.giorno).sort().pop();
  const rip = bl.filter(b => b.tipo === 'ripasso' && b.argomentoId === a).map(b => diffDays(fine, b.giorno));
  ok(rip.length >= 3, `ripassi ${rip}`);
  ok(rip[0] >= 1 && rip.every((x, i) => i === 0 || x > rip[i - 1]), `distanze ${rip}`);
});
test('piano: due esami vicini, il primo ha la precedenza', () => {
  const s = stato([{ nome: 'Primo', cfu: 6, data: '2026-12-10' }, { nome: 'Secondo', cfu: 6, data: '2026-12-20' }]);
  const r = pianifica(s, OGGI);
  eq(r.mancanti[s.esami[0].id], undefined, 'il primo ci sta');
  const primaSettimana = r.blocchi.filter(b => b.giorno < '2026-11-10');
  const h = id => primaSettimana.filter(b => b.esameId === id).reduce((a, b) => a + b.ore, 0);
  ok(h(s.esami[0].id) >= h(s.esami[1].id), 'più ore al primo');
});
test('piano: se non ci sta, lo dice (ore mancanti)', () => {
  const s = stato([{ cfu: 9, data: '2026-11-10' }]);
  const r = pianifica(s, OGGI);
  ok(r.mancanti[s.esami[0].id] > 100, JSON.stringify(r.mancanti));
});
test('ripianifica: il lavoro fatto resta, quello saltato si ridistribuisce senza perdersi', () => {
  const s = stato([{ cfu: 6, data: '2027-02-01', argomenti: 'A\nB\nC' }]);
  ripianifica(s, OGGI);
  const totPrima = s.piano.blocchi.reduce((a, b) => a + b.ore, 0);
  // Il primo giorno fatto, il secondo saltato
  for (const b of s.piano.blocchi.filter(b => b.giorno === OGGI)) segnaFatto(s, b, true, OGGI);
  const fatto = s.piano.blocchi.filter(b => b.fatto).reduce((a, b) => a + b.ore, 0);
  const domani = addDays(OGGI, 2);
  ripianifica(s, domani);
  const totDopo = s.piano.blocchi.reduce((a, b) => a + b.ore, 0);
  vicino(totDopo + fatto, totPrima, 2, 'ore totali');
  ok(s.piano.blocchi.every(b => b.giorno >= domani), 'niente nel passato');
  eq(s.fatti.reduce((a, b) => a + b.ore, 0), fatto, 'storico');
});
test('argomento finito quando le sue ore di studio sono fatte', () => {
  const s = stato([{ cfu: 6, data: '2027-03-01', argomenti: 'A\nB' }]);
  ripianifica(s, OGGI);
  const a = s.esami[0].argomenti[0];
  for (const b of s.piano.blocchi.filter(b => b.argomentoId === a.id && b.tipo === 'studio')) segnaFatto(s, b, true, '2026-12-01');
  ok(a.fattoIl, 'segnato fatto');
});

// ---------------------------------------------------------------- avvisi, media, ics
test('avvisi: conflitto, prenotazione in scadenza oggi', () => {
  const s = stato([{ nome: 'A', data: '2026-11-05' }, { nome: 'B', data: '2026-11-05' }]);
  const av = avvisi(s, OGGI, pianifica(s, OGGI));
  ok(av.some(a => a.livello === 'rosso' && a.testo.includes('stesso giorno')));
  ok(av.some(a => a.testo.includes('Prenota entro il 03/11') && a.testo.includes('oggi')));
});
test('stato prenotazione: futura, aperta, chiusa', () => {
  const a = { data: '2027-02-08', aperturaPren: '2027-01-19', chiusuraPren: '2027-02-06' };
  eq(statoPrenotazione(a, '2027-01-10').k, 'futura');
  eq(statoPrenotazione(a, '2027-01-20').k, 'aperta');
  eq(statoPrenotazione(a, '2027-02-07').k, 'chiusa');
});
test('media ponderata e lode', () => {
  const s = stato([{ cfu: 6, data: '2027-01-01' }, { cfu: 12, data: '2027-02-01' }]);
  s.esami[0].esito = { voto: 30, lode: true };
  s.esami[1].esito = { voto: 24, lode: false };
  const c = carriera(s);
  eq(c.cfu, 18);
  vicino(c.media, 26, 1e-9);
  eq(c.lodi, 1);
});
test('ics: esami e scadenze di prenotazione', () => {
  const s = statoIniziale();
  for (const e of s.esami) e.scelta = e.appelli[e.appelli.length - 1].id;
  const ics = creaIcs(s, new Date('2026-11-03T10:00:00Z'));
  ok(ics.startsWith('BEGIN:VCALENDAR') && ics.trim().endsWith('END:VCALENDAR'));
  eq((ics.match(/BEGIN:VEVENT/g) ?? []).length, 30);
  ok(ics.includes('DTSTART;TZID=Europe/Rome:20261106T093000'));
  ok(ics.split('\r\n').every(l => l.length <= 75), 'righe lunghe');
});
test('stato iniziale: piano completo senza errori e in tempi brevi', () => {
  const s = statoIniziale();
  const t0 = performance.now();
  const p = proponiAppelli(s, OGGI);
  for (const e of s.esami) e.scelta = p[e.id];
  ripianifica(s, OGGI);
  const ms = performance.now() - t0;
  ok(ms < 2000, `${Math.round(ms)} ms`);
  ok(s.piano.blocchi.length > 100);
  ok(appelloScelto(s.esami[0]));
});

export default risultati;
