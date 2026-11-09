// Prove automatiche di import, scelta degli appelli, piano di studio ed export .ics. Si aprono da tests.html.
import { leggiImport, unisci, leggiArgomenti, nuovoEsame, importaPegaso } from './importa.js';
import { proponiAppelli, avvisi, carriera, statoPrenotazione } from './esami.js';
import { pianifica, ripianifica, segnaFatto, capacita, oreTotali, QUOTE, appelloScelto, lezioniProva, argomentiDi } from './pianifica.js';
import { lezioniFinale, frequenza, espandi } from './pegaso.js';
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
  const s = { versione: 1, esami: [], impostazioni: { oreGiorno: 4, giorni: [0, 1, 2, 3, 4, 5, 6], pause: [], giorniRipasso: 3, unoAllaVolta: false, ...imp }, piano: null, fatti: [] };
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
  eq(s.esami.filter(e => e.appelli.length && p[e.id] === 'salta').length, 0, 'nessun esame saltato');
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
  for (const e of s.esami) if (e.appelli.length) e.scelta = e.appelli[e.appelli.length - 1].id;
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

// ---------------------------------------------------------------- Pegaso
const IA = '0312509INF01IINM';
/** Catalogo finto (i titoli veri restano nel file privato): 45 lezioni di IA e 2 esami del terzo anno. */
const CAT = { formato: 'gauni-pegaso-v1', oreLezione: 1.5, lezioni: { [IA]: Array.from({ length: 45 }, (_, i) => `Lezione di prova ${i + 1}`) }, altri: [['Esame A', 6, 3], ['Esame B', 12, 3]] };
const conCatalogo = () => { const s = statoIniziale(); importaPegaso(s, CAT, OGGI); return s; };

test('Pegaso: senza dati importati niente lezioni (l\'app pubblica è generica)', () => {
  const s = statoIniziale();
  ok(s.esami.every(e => !e.lezioni), 'nessuna lezione');
  eq(s.esami.length, 10);
});
test('Pegaso: il catalogo importato aggiunge lezioni e altri esami del piano', () => {
  const s = conCatalogo();
  const ia = s.esami.find(e => e.codice === IA);
  eq(ia.lezioni.length, 45);
  eq(ia.oreLezione, 1.5);
  eq(s.esami.length, 12);
  eq(s.esami.reduce((a, e) => a + e.cfu, 0), 84 + 18);
});
test('Pegaso: la prova intermedia esclude le ultime 10 lezioni (5 fino a 4 CFU)', () => {
  const s = conCatalogo();
  const ia = s.esami.find(e => e.codice === IA);
  ia.scelta = ia.appelli[0].id;
  eq(lezioniProva(ia).length, 35);
  eq(argomentiDi(ia)[0].id, 'L1');
  eq(oreTotali(ia), Math.round(35 * 1.5 / QUOTE.studio));
  eq(lezioniFinale(4), 5);
});
test('Pegaso: import personale (voti, frequenza, lezioni viste in forma compatta)', () => {
  const s = statoIniziale();
  const r = importaPegaso(s, { ...CAT, esiti: [{ nome: 'Programmazione', cfu: 12, voto: 29 }, { nome: 'Basi di dati', cfu: 9, voto: 18 }],
    frequenza: { [IA]: 24 }, viste: { [IA]: '100x5,40x15,20,0x24' } }, OGGI);
  eq(r, { esiti: 2, corsi: 1 });
  const ia = s.esami.find(e => e.codice === IA);
  eq(ia.lezioni.filter(l => l.fattoIl).length, 5);
  eq(ia.lezioni[5].visto, 40);
  eq(frequenza(ia), 25);   // media delle lezioni (24,9%): la piattaforma tronca a 24
  const c = carriera(s);
  eq(c.cfu, 21);
  vicino(c.media, (29 * 12 + 18 * 9) / 21, 1e-9);
  eq(espandi('100x2,40,0x3'), [100, 100, 40, 0, 0, 0]);
});
test('Pegaso: lezioni già viste in parte riducono le ore da pianificare', () => {
  const s = conCatalogo();
  const ia = s.esami.find(e => e.codice === IA);
  for (const e of s.esami) e.scelta = 'salta';
  ia.scelta = ia.appelli[2].id;
  const prima = pianifica(s, OGGI).blocchi.filter(b => b.tipo === 'video').reduce((a, b) => a + b.ore, 0);
  importaPegaso(s, { viste: { [IA]: '100x5,40x15,20,0x24' } }, OGGI);
  const dopo = pianifica(s, OGGI).blocchi.filter(b => b.tipo === 'video').reduce((a, b) => a + b.ore, 0);
  ok(dopo < prima - 10, `prima ${prima} h, dopo ${dopo} h`);
  ok(!pianifica(s, OGGI).blocchi.some(b => b.argomentoId === 'L1' && b.tipo === 'video'), 'lezione 1 già fatta');
});
test('Pegaso: avviso e appello escluso se la frequenza non arriva al 70% in tempo', () => {
  const s = conCatalogo();
  const ia = s.esami.find(e => e.codice === IA);
  ia.scelta = ia.appelli[0].id;
  ia.frequenza = 24;
  ok(avvisi(s, OGGI, null).some(a => a.frequenza && a.esameId === ia.id && a.testo.includes('24%')));
  ok(frequenza(ia) != null);
  ia.frequenza = 80;
  ok(!avvisi(s, OGGI, null).some(a => a.frequenza && a.esameId === ia.id));
  const ux = s.esami.find(e => e.nome === 'User experience');
  importaPegaso(s, { lezioni: { [ux.codice]: Array(30).fill('x') }, frequenza: { [ux.codice]: 0 } }, OGGI);
  eq(proponiAppelli(s, '2026-11-04')[ux.id], 'salta', 'User experience: 0% e prenotazioni che chiudono oggi');
});

// ---------------------------------------------------------------- un esame alla volta
const seq = s => { s.impostazioni.unoAllaVolta = true; return s; };
const giorniDi = (bl, id, tipi) => bl.filter(b => b.esameId === id && (!tipi || tipi.includes(b.tipo))).map(b => b.giorno).sort();
test('un esame alla volta: prima le videolezioni, poi ripasso e quiz alternati, simulazioni, alla fine il ripasso generale', () => {
  const s = seq(stato([{ cfu: 6, data: '2027-03-01', argomenti: 'A\nB\nC\nD\nE\nF\nG\nH\nI\nJ\nK\nL' }]));
  const bl = pianifica(s, OGGI).blocchi, id = s.esami[0].id;
  const ultimoVideo = giorniDi(bl, id, ['video']).pop(), primoRip = giorniDi(bl, id, ['ripasso'])[0];
  const primoQuiz = giorniDi(bl, id, ['quiz'])[0], ultimoRip = giorniDi(bl, id, ['ripasso']).pop();
  ok(ultimoVideo <= primoRip, `video fino al ${ultimoVideo}, ripasso dal ${primoRip}`);
  ok(primoQuiz < ultimoRip, `quiz alternati al ripasso: primo quiz ${primoQuiz}, ultimo ripasso ${ultimoRip}`);
  ok(ultimoRip <= giorniDi(bl, id, ['simulazione'])[0], 'simulazioni dopo il ripasso');
  // Nessun buco: dalla fine dei video agli ultimi giorni al massimo un giorno di pausa di fila, senza giornate piene
  const lavoro = new Set(giorniDi(bl, id));
  let buco = 0;
  for (let d = ultimoVideo; d < '2027-02-26'; d = addDays(d, 1)) { buco = lavoro.has(d) ? 0 : buco + 1; ok(buco <= 1, `due giorni vuoti di fila: ${d}`); }
  ok(bl.filter(b => b.giorno > ultimoVideo && b.tipo !== 'finale').every(b => b.ore < 4), 'ritmo leggero dopo i video');
  eq(bl.filter(b => b.tipo === 'simulazione' && b.esameId === id).map(b => b.argomentoId).filter((x, i, a) => a.indexOf(x) === i), ['S1', 'S2']);
  ok(bl.filter(b => b.giorno >= '2027-02-26').every(b => b.tipo === 'finale'), 'ultimi 3 giorni');
  eq(pianifica(s, OGGI).mancanti, {});
});
test('un esame alla volta: esami lontani non si mescolano', () => {
  const s = seq(stato([{ nome: 'Primo', cfu: 6, data: '2027-01-20' }, { nome: 'Secondo', cfu: 6, data: '2027-04-20' }]));
  const r = pianifica(s, OGGI);
  const finePrimo = giorniDi(r.blocchi, s.esami[0].id, ['video', 'ripasso', 'quiz', 'simulazione']).pop();
  const inizioSecondo = giorniDi(r.blocchi, s.esami[1].id)[0];
  ok(finePrimo < inizioSecondo, `primo fino al ${finePrimo}, secondo dal ${inizioSecondo}`);
  eq(r.insieme, {});
  eq(r.mancanti, {});
});
test('esami vicini ma con abbastanza tempo: comunque uno alla volta', () => {
  const s = seq(stato([{ nome: 'Primo', cfu: 6, data: '2026-12-20' }, { nome: 'Secondo', cfu: 12, data: '2027-01-05' }], { oreGiorno: 8 }));
  const r = pianifica(s, OGGI);
  eq(r.insieme, {});
  eq(r.mancanti, {});
});
test('due esami insieme solo se serve: il secondo prende al massimo metà giornata', () => {
  const s = seq(stato([{ nome: 'Primo', cfu: 6, data: '2026-12-01' }, { nome: 'Secondo', cfu: 6, data: '2026-12-05' }]));
  const r = pianifica(s, OGGI);
  ok(r.insieme[s.esami[1].id], 'il secondo parte insieme al primo');
  const ore = (d, id) => r.blocchi.filter(b => b.giorno === d && b.esameId === id && b.tipo !== 'finale').reduce((a, b) => a + b.ore, 0);
  const giorni = [...new Set(r.blocchi.filter(b => b.tipo !== 'finale' && b.giorno < '2026-11-28').map(b => b.giorno))];   // prima del ripasso finale del primo
  ok(giorni.every(d => ore(d, s.esami[0].id) >= ore(d, s.esami[1].id)), 'il primo ha sempre la precedenza');
  ok(giorni.some(d => ore(d, s.esami[1].id) > 0 && ore(d, s.esami[0].id) > 0), 'giorni con due esami');
});
test('un esame alla volta: la lezione è "fatta" quando sono segnati tutti i suoi pezzi', () => {
  const s = seq(conCatalogo());
  const ia = s.esami.find(e => e.codice === IA);
  for (const e of s.esami) e.scelta = 'salta';
  ia.scelta = ia.appelli[2].id;
  ripianifica(s, OGGI);
  const pezzi = s.piano.blocchi.filter(b => b.tipo === 'video' && b.argomentoId === 'L1');
  ok(pezzi.length >= 1);
  for (const b of pezzi) segnaFatto(s, b, true, OGGI);
  ok(ia.lezioni[0].fattoIl, 'lezione 1 fatta');
  segnaFatto(s, pezzi[0], false, OGGI);
  eq(ia.lezioni[0].fattoIl, null);
});

export default risultati;
