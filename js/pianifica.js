// Piano di studio: da oggi fino all'ultimo esame, giorno per giorno. Si lavora a mezz'ore (unità) per non
// avere arrotondamenti strani. Le ore di ogni esame si dividono in: studio degli argomenti (più tempo ai
// difficili), ripassi a distanza crescente, simulazioni d'esame e ripasso finale negli ultimi giorni.
import { addDays, diffDays, weekday } from './date.js';
import { lezioniFinale } from './pegaso.js';

export const QUOTE = { studio: 0.6, ripasso: 0.15, simulazione: 0.1, finale: 0.15 };
export const PESO = { facile: 1, medio: 1.5, difficile: 2.2 };
export const RIPASSI = [1, 3, 7, 14];         // giorni dopo aver finito un argomento
export const TIPI = {
  studio: ['📖', 'Studio'], ripasso: ['🔁', 'Ripasso'], simulazione: ['📝', 'Simulazione d\'esame'], finale: ['🎯', 'Ripasso generale'],
  video: ['📺', 'Videolezione'], quiz: ['🧠', 'Quiz di allenamento'],
};
const U = 2;                                   // unità per ora (mezz'ore)
const toU = h => Math.round(h * U);

/** Appello scelto per l'esame (o null). */
export const appelloScelto = e => e.appelli.find(a => a.id === e.scelta) ?? null;
/**
 * Lezioni (Pegaso) oggetto della prova scelta: la prova intermedia esclude le ultime 10 (5 fino a 4 CFU),
 * che sono il programma della prova finale. null se l'esame non ha l'elenco delle lezioni.
 */
export function lezioniProva(e) {
  if (!e.lezioni?.length) return null;
  const a = appelloScelto(e) ?? e.appelli[0];
  return /intermedia/i.test(a?.tipo ?? '') ? e.lezioni.slice(0, Math.max(1, e.lezioni.length - lezioniFinale(e.cfu))) : e.lezioni;
}
/** Ore di studio previste: dalle lezioni (ore per lezione) se ci sono, altrimenti CFU × ore per CFU; meno la parte già studiata. */
export function oreTotali(e) {
  const lez = lezioniProva(e);
  const base = lez ? (lez.length * (e.oreLezione ?? 1.5)) / QUOTE.studio : e.cfu * (e.oreCfu ?? 25);
  return Math.round(base * (1 - (e.giaStudiato ?? 0) / 100));
}
/** Esami da preparare: con un appello scelto nel futuro e ancora senza voto. */
export const esamiAttivi = (state, oggi) => state.esami.filter(e => !e.esito && appelloScelto(e) && appelloScelto(e).data > oggi);

/** Ore di studio disponibili in un giorno (giorni della settimana scelti, pause a ritmo ridotto o zero). */
export function capacita(imp, d) {
  if (!imp.giorni.includes(weekday(d))) return 0;
  const p = (imp.pause ?? []).find(x => x.da <= d && d <= x.a);
  return Math.max(0, imp.oreGiorno * (p ? p.fattore : 1));
}

/**
 * Argomenti dell'esame (o, se non li hai ancora scritti, "parti" generiche: una ogni 1,5 CFU), con la
 * data in cui sono stati finiti la prima volta.
 */
export function argomentiDi(e) {
  const lez = lezioniProva(e);
  if (lez) return lez.map(l => ({ id: `L${l.n}`, titolo: `Lez. ${l.n} · ${l.titolo}`, difficolta: l.difficolta ?? 'medio', fattoIl: l.fattoIl ?? null, visto: l.visto ?? 0, lezione: l }));
  if (e.argomenti?.length) return e.argomenti;
  const n = Math.max(3, Math.round(e.cfu / 1.5));
  return Array.from({ length: n }, (_, k) => ({ id: `auto${k + 1}`, titolo: `Parte ${k + 1} di ${n}`, difficolta: 'medio', fattoIl: e.autoFatti?.[`auto${k + 1}`] ?? null, auto: true }));
}

/** Ore già fatte (blocchi segnati) per esame e tipo, e per argomento. */
export function oreFatte(state, esameId) {
  const out = { totale: 0, studio: 0, ripasso: 0, simulazione: 0, finale: 0, video: 0, quiz: 0, argomenti: {}, ripassiArg: {}, chiavi: {} };
  const all = [...(state.fatti ?? []), ...(state.piano?.blocchi ?? []).filter(b => b.fatto)];
  for (const b of all) {
    if (b.esameId !== esameId) continue;
    out.totale += b.ore;
    out[b.tipo] = (out[b.tipo] ?? 0) + b.ore;
    if (b.argomentoId && (b.tipo === 'studio' || b.tipo === 'video')) out.argomenti[b.argomentoId] = (out.argomenti[b.argomentoId] ?? 0) + b.ore;
    if (b.argomentoId) out.chiavi[`${b.tipo}|${b.argomentoId}`] = (out.chiavi[`${b.tipo}|${b.argomentoId}`] ?? 0) + b.ore;
    if (b.argomentoId && b.tipo === 'ripasso') out.ripassiArg[b.argomentoId] = (out.ripassiArg[b.argomentoId] ?? 0) + 1;
  }
  return out;
}

/** Ore di studio previste per ogni argomento (la quota "studio" divisa per difficoltà). */
export function oreArgomenti(e) {
  const args = argomentiDi(e);
  const tot = oreTotali(e) * QUOTE.studio;
  const somma = args.reduce((a, t) => a + PESO[t.difficolta ?? 'medio'], 0) || 1;
  return Object.fromEntries(args.map(t => [t.id, (tot * PESO[t.difficolta ?? 'medio']) / somma]));
}

/**
 * Genera il piano da `oggi` in poi. Restituisce { blocchi, mancanti: { esameId: ore che non ci stanno },
 * previste: { esameId: ore } }. Il lavoro già fatto (state.fatti + blocchi segnati) non si ripete.
 */
export function pianifica(state, oggi) {
  return state.impostazioni.unoAllaVolta === false ? pianificaMisto(state, oggi) : pianificaSequenza(state, oggi);
}

/** Metodo "misto": più esami insieme, con ripassi a distanza crescente (1, 3, 7, 14 giorni). */
function pianificaMisto(state, oggi) {
  const imp = state.impostazioni;
  const gr = imp.giorniRipasso ?? 3;
  const esami = esamiAttivi(state, oggi).map(e => {
    const data = appelloScelto(e).data;
    const H = oreTotali(e);
    const fatte = oreFatte(state, e.id);
    const need = {};
    for (const k of ['studio', 'ripasso', 'simulazione', 'finale']) need[k] = Math.max(0, toU(H * QUOTE[k]) - toU(fatte[k] ?? 0));
    const target = oreArgomenti(e);
    const args = argomentiDi(e);
    // Coda degli argomenti ancora da studiare, nell'ordine del programma
    // (le lezioni già viste in parte contano: resta solo la parte che manca)
    const coda = args.filter(t => !t.fattoIl).map(t => ({ t, rest: Math.max(1, toU(target[t.id] * (1 - (t.visto ?? 0) / 100)) - toU(fatte.argomenti[t.id] ?? 0)) }));
    need.studio = Math.min(need.studio, coda.reduce((a, c) => a + c.rest, 0));
    // Ripassi in programma per gli argomenti già finiti
    const dovuti = [];
    for (const t of args) if (t.fattoIl) {
      const giaFatti = fatte.ripassiArg[t.id] ?? 0;
      RIPASSI.slice(giaFatti).forEach(n => dovuti.push({ t, quando: addDays(t.fattoIl, n) }));
    }
    const nArg = Math.max(1, args.length);
    const ripassoU = Math.max(1, Math.round(need.ripasso / (nArg * RIPASSI.length)) || 1);
    return { e, data, inizioFinale: addDays(data, -gr), need, coda, dovuti, ripassoU, fine: false };
  }).sort((a, b) => a.data.localeCompare(b.data));

  const blocchi = [];
  const add = (giorno, x, tipo, u, t = null) => {
    if (u <= 0) return;
    const old = blocchi.find(b => b.giorno === giorno && b.esameId === x.e.id && b.tipo === tipo && (b.argomentoId ?? null) === (t?.id ?? null));
    if (old) { old.ore += u / U; return; }
    blocchi.push({ id: `${giorno}|${x.e.id}|${tipo}|${t?.id ?? ''}`, giorno, esameId: x.e.id, tipo, argomentoId: t?.id ?? null, titolo: t?.titolo ?? '', ore: u / U, fatto: false });
  };
  if (!esami.length) return { blocchi, mancanti: {}, previste: {} };

  const ultimo = esami[esami.length - 1].data;
  const giorni = Math.max(0, diffDays(oggi, ultimo));
  // Capacità di ogni giorno (in unità); oggi meno quello che hai già fatto oggi
  const fattoOggi = (state.fatti ?? []).filter(b => b.giorno === oggi).reduce((a, b) => a + b.ore, 0);
  const capU = Array.from({ length: giorni }, (_, i) => {
    const d = addDays(oggi, i);
    let c = toU(capacita(imp, d) - (i === 0 ? fattoOggi : 0));
    if (esami.some(x => x.data === d)) c = Math.floor(c / 2);   // giorno d'esame: mezza giornata per gli altri
    return Math.max(0, c);
  });
  // Giorni di studio (con capacità) prima di una data: per sapere a che ritmo serve andare
  const giorniUtili = (from, to) => { let n = 0; for (let i = diffDays(oggi, from); i < Math.min(giorni, diffDays(oggi, to)); i++) if (capU[i] > 0) n++; return n; };

  /** Usa fino a `u` unità per l'esame x nel giorno d: ripassi dovuti, simulazioni, poi argomenti nuovi. */
  function lavora(x, d, u, finale) {
    let used = 0;
    if (finale) {
      const g = Math.min(u, x.need.finale || u);   // negli ultimi giorni anche oltre la quota: solo ripasso
      add(d, x, 'finale', g);
      x.need.finale = Math.max(0, x.need.finale - g);
      return g;
    }
    // Ripassi a distanza crescente già scaduti
    x.dovuti.sort((a, b) => a.quando.localeCompare(b.quando));
    while (used < u && x.need.ripasso > 0 && x.dovuti.length && x.dovuti[0].quando <= d) {
      const r = x.dovuti.shift();
      const g = Math.min(x.ripassoU, u - used, x.need.ripasso);
      add(d, x, 'ripasso', g, r.t);
      x.need.ripasso -= g;
      used += g;
    }
    // Simulazioni nell'ultima settimana prima del ripasso finale (o prima, se gli argomenti sono finiti)
    const settimanaSim = diffDays(d, x.inizioFinale) <= 7;
    if (used < u && x.need.simulazione > 0 && (settimanaSim || !x.coda.length)) {
      const g = Math.min(u - used, x.need.simulazione, 3 * U);
      add(d, x, 'simulazione', g);
      x.need.simulazione -= g;
      used += g;
    }
    // Argomenti nuovi
    while (used < u && x.coda.length && x.need.studio > 0) {
      const c = x.coda[0];
      const g = Math.min(u - used, c.rest, x.need.studio);
      add(d, x, 'studio', g, c.t);
      c.rest -= g;
      x.need.studio -= g;
      used += g;
      if (c.rest <= 0) {   // argomento finito: ripassi a 1, 3, 7, 14 giorni (se prima del ripasso finale)
        x.coda.shift();
        for (const n of RIPASSI) { const q = addDays(d, n); if (q < x.inizioFinale) x.dovuti.push({ t: c.t, quando: q }); }
      }
    }
    if (!x.coda.length) x.need.studio = 0;
    // Avanza tempo: ripassi anticipati e simulazioni in più (se c'è ancora quota)
    while (used < u && x.need.ripasso > 0 && x.dovuti.length) {
      const r = x.dovuti.shift();
      const g = Math.min(x.ripassoU, u - used, x.need.ripasso);
      add(d, x, 'ripasso', g, r.t);
      x.need.ripasso -= g;
      used += g;
    }
    if (used < u && x.need.ripasso > 0 && !x.coda.length && !x.dovuti.length) {   // ripasso di tutto quello già fatto
      const g = Math.min(u - used, x.need.ripasso);
      add(d, x, 'ripasso', g);
      x.need.ripasso -= g;
      used += g;
    }
    if (used < u && x.need.simulazione > 0 && !x.coda.length) {
      const g = Math.min(u - used, x.need.simulazione);
      add(d, x, 'simulazione', g);
      x.need.simulazione -= g;
      used += g;
    }
    return used;
  }
  const resto = x => x.need.studio + x.need.ripasso + x.need.simulazione;

  for (let i = 0; i < giorni; i++) {
    const d = addDays(oggi, i);
    let cap = capU[i];
    if (cap <= 0) continue;
    const aperti = esami.filter(x => x.data > d);
    // 1) Esami negli ultimi giorni: solo ripasso generale, con precedenza (il più vicino prima)
    for (const x of aperti.filter(x => d >= x.inizioFinale)) {
      const left = Math.max(1, giorniUtili(d, x.data));
      const quota = x.need.finale > 0 ? Math.ceil(x.need.finale / left) : 0;
      const g = Math.min(cap, Math.max(quota, Math.ceil(cap / 2)));   // almeno metà giornata; il resto agli altri esami
      cap -= lavora(x, d, g, true);
    }
    // 2) Gli altri: ognuno il ritmo che gli serve per finire in tempo, il più vicino per primo
    const normali = aperti.filter(x => d < x.inizioFinale && resto(x) > 0);
    for (const x of normali) {
      if (cap <= 0) break;
      const left = Math.max(1, giorniUtili(d, x.inizioFinale));
      cap -= lavora(x, d, Math.min(cap, Math.max(U, Math.ceil(resto(x) / left))), false);   // almeno un'ora alla volta
    }
    // 3) Il tempo che avanza va all'esame più vicino (portarsi avanti)
    for (const x of normali) {
      if (cap <= 0) break;
      cap -= lavora(x, d, cap, false);
    }
  }
  const mancanti = {}, previste = {};
  for (const x of esami) {
    previste[x.e.id] = oreTotali(x.e);
    const m = resto(x) / U;   // studio, ripassi e simulazioni che non entrano prima del ripasso finale
    if (m >= 1) mancanti[x.e.id] = Math.round(m);
  }
  blocchi.sort((a, b) => a.giorno.localeCompare(b.giorno) || esami.findIndex(x => x.e.id === a.esameId) - esami.findIndex(x => x.e.id === b.esameId));
  return { blocchi, mancanti, previste };
}

/**
 * Ripianifica: il lavoro già segnato come fatto passa nello storico (state.fatti), quello non fatto dei giorni
 * passati torna in coda, e il piano riparte da oggi senza spostare le date degli esami.
 */
export function ripianifica(state, oggi) {
  state.fatti ??= [];
  for (const b of state.piano?.blocchi ?? []) if (b.fatto) state.fatti.push({ giorno: b.giorno, esameId: b.esameId, tipo: b.tipo, argomentoId: b.argomentoId, ore: b.ore });
  const r = pianifica({ ...state, piano: null }, oggi);
  state.piano = { creatoIl: oggi, blocchi: r.blocchi, mancanti: r.mancanti, insieme: r.insieme ?? {}, inizi: r.inizi ?? {} };
  return r;
}

/** Segna un blocco fatto (o non fatto). Quando le ore di studio di un argomento sono finite, l'argomento è "fatto". */
export function segnaFatto(state, blocco, fatto, oggi) {
  blocco.fatto = fatto;
  if (blocco.tipo === 'video' && blocco.argomentoId) {   // videolezione: fatta quando sono segnati tutti i suoi pezzi
    const e = state.esami.find(x => x.id === blocco.esameId);
    const l = e?.lezioni?.find(x => `L${x.n}` === blocco.argomentoId);
    const t = l ?? e?.argomenti.find(x => x.id === blocco.argomentoId);
    const resta = (state.piano?.blocchi ?? []).some(b => b !== blocco && b.esameId === blocco.esameId && b.tipo === 'video' && b.argomentoId === blocco.argomentoId && !b.fatto);
    const giorno = blocco.giorno <= oggi ? blocco.giorno : oggi;
    if (t) t.fattoIl = fatto && !resta ? (t.fattoIl ?? giorno) : fatto ? t.fattoIl : null;
    else if (e && blocco.argomentoId.startsWith('auto')) { e.autoFatti ??= {}; if (fatto && !resta) e.autoFatti[blocco.argomentoId] ??= giorno; else if (!fatto) delete e.autoFatti[blocco.argomentoId]; }
    return;
  }
  if (blocco.tipo !== 'studio' || !blocco.argomentoId) return;
  const e = state.esami.find(x => x.id === blocco.esameId);
  if (!e) return;
  const target = oreArgomenti(e)[blocco.argomentoId] ?? 0;
  const fatte = oreFatte(state, e.id).argomenti[blocco.argomentoId] ?? 0;
  const giorno = blocco.giorno <= oggi ? blocco.giorno : oggi;
  if (/^L\d+$/.test(blocco.argomentoId)) {   // lezione Pegaso: conta anche la parte vista prima
    const l = e.lezioni.find(x => `L${x.n}` === blocco.argomentoId);
    if (!l) return;
    const finito = fatte >= target * (1 - (l.visto ?? 0) / 100) - 0.25;
    l.fattoIl = finito ? (l.fattoIl ?? giorno) : null;
    return;
  }
  const finito = fatte >= target - 0.25;
  if (blocco.argomentoId.startsWith('auto')) {
    e.autoFatti ??= {};
    if (finito) e.autoFatti[blocco.argomentoId] ??= giorno; else delete e.autoFatti[blocco.argomentoId];
  } else {
    const t = e.argomenti.find(x => x.id === blocco.argomentoId);
    if (t) t.fattoIl = finito ? (t.fattoIl ?? giorno) : null;
  }
}

/** Ore indietro: blocchi dei giorni passati non segnati. */
export const oreIndietro = (state, oggi) => (state.piano?.blocchi ?? []).filter(b => b.giorno < oggi && !b.fatto).reduce((a, b) => a + b.ore, 0);

/**
 * Quante ore al giorno servirebbero per starci dentro con tutti gli esami (a parità di giorni e pause).
 * Restituisce { ore, impossibili: [esameId] } — impossibili: non ci stanno nemmeno studiando 14 ore al giorno.
 */
export function oreNecessarie(state, oggi) {
  const prova = h => pianifica({ ...state, impostazioni: { ...state.impostazioni, oreGiorno: h }, piano: null }, oggi).mancanti;
  const impossibili = Object.keys(prova(14));
  const ok = h => Object.keys(prova(h)).every(id => impossibili.includes(id));
  let lo = 0.5, hi = 14;
  if (ok(state.impostazioni.oreGiorno)) return { ore: state.impostazioni.oreGiorno, impossibili };
  while (hi - lo > 0.25) { const m = (lo + hi) / 2; if (ok(m)) hi = m; else lo = m; }
  return { ore: Math.ceil(hi * 2) / 2, impossibili };
}

// ---------------------------------------------------------------- un esame alla volta
/** Metodo "un esame alla volta": quote delle ore di ogni esame per fase. */
export const QSEQ = { video: 0.35, ripasso: 0.35, quiz: 0.18, finale: 0.12 };
const BLOCCO = 3;   // mezz'ore: ripassi e quiz a blocchi di circa un'ora e mezza

/**
 * Cosa resta da fare per un esame, in ordine: 1) videolezioni (o primo studio degli argomenti),
 * 2) ripasso di tutto a gruppi, 3) quiz di allenamento a gruppi e due simulazioni complete.
 * Ogni compito: { fase, tipo, key, titolo, u (mezz'ore che mancano), tot (mezz'ore previste) }.
 */
export function compiti(state, e) {
  const H = oreTotali(e);
  const fatte = oreFatte(state, e.id);
  const done = (tipo, key) => toU(fatte.chiavi[`${tipo}|${key}`] ?? 0);
  const args = argomentiDi(e);
  const n = Math.max(1, args.length);
  const pegaso = !!e.lezioni?.length;
  const somma = args.reduce((a, t) => a + PESO[t.difficolta ?? 'medio'], 0) || 1;
  const w = t => PESO[t.difficolta ?? 'medio'] / somma;
  const nome = (a, b) => (pegaso ? `lezioni ${args[a].lezione.n}-${args[b].lezione.n}` : a === b ? args[a].titolo : `${args[a].titolo} … ${args[b].titolo}`);
  const maiusc = t => t.charAt(0).toUpperCase() + t.slice(1);
  const out = [];
  // 1) Videolezioni / primo studio, nell'ordine del programma
  for (const t of args) {
    const tot = Math.max(1, toU(H * QSEQ.video * w(t)));
    const u = t.fattoIl ? 0 : Math.max(1, Math.round(tot * (1 - (t.visto ?? 0) / 100)) - done('video', t.id) - done('studio', t.id));
    out.push({ fase: 1, tipo: 'video', key: t.id, titolo: pegaso ? `${t.titolo} (video, Obiettivi e test)` : t.titolo, u, tot });
  }
  // 2) Ripasso e quiz alternati: si ripassa un gruppo di lezioni e subito dopo si fanno i quiz su quelle lezioni
  const rip = toU(H * QSEQ.ripasso);
  const g = Math.max(1, Math.round((BLOCCO * n) / Math.max(1, rip)));
  const ripassi = [];
  for (let a = 0; a < n; a += g) {
    const b = Math.min(n, a + g) - 1;
    const tot = Math.max(1, Math.round((rip * (b - a + 1)) / n));
    ripassi.push({ da: a, c: { fase: 2, tipo: 'ripasso', key: `R${a + 1}-${b + 1}`, titolo: maiusc(nome(a, b)), u: Math.max(0, tot - done('ripasso', `R${a + 1}-${b + 1}`)), tot } });
  }
  const quiz = toU(H * QSEQ.quiz);
  const sim = Math.min(2, Math.max(1, Math.round(quiz / 6)));   // un'ora a simulazione, se c'è tempo
  const restoQ = Math.max(0, quiz - 2 * sim);
  const k = Math.max(1, Math.round(restoQ / BLOCCO));
  for (let i = 0; i < k && restoQ > 0; i++) {
    const a = Math.floor((i * n) / k), b = Math.floor(((i + 1) * n) / k) - 1;
    if (b < a) continue;
    while (ripassi.length && ripassi[0].da <= b) out.push(ripassi.shift().c);   // prima il ripasso di queste lezioni
    const tot = Math.max(1, Math.round(restoQ / k));
    out.push({ fase: 2, tipo: 'quiz', key: `Q${a + 1}-${b + 1}`, titolo: `${maiusc(nome(a, b))}${pegaso ? ' (test di autovalutazione)' : ''}`, u: Math.max(0, tot - done('quiz', `Q${a + 1}-${b + 1}`)), tot });
  }
  for (const r of ripassi) out.push(r.c);
  // 3) Due simulazioni complete, prima degli ultimi giorni
  for (const s of [1, 2]) {
    out.push({ fase: 3, tipo: 'simulazione', key: `S${s}`, titolo: pegaso ? `Simulazione ${s}: 24 domande in 35 minuti, su tutto il programma` : `Simulazione d'esame ${s}`, u: Math.max(0, sim - done('simulazione', `S${s}`)), tot: sim });
  }
  return out;
}

/** Avanzamento per fase: { 1: {fatte, tot}, 2: …, 3: … } in ore. */
export function fasi(state, e) {
  const out = { 1: { fatte: 0, tot: 0 }, 2: { fatte: 0, tot: 0 }, 3: { fatte: 0, tot: 0 } };
  for (const c of compiti(state, e)) { out[c.fase].tot += c.tot / U; out[c.fase].fatte += (c.tot - c.u) / U; }
  return out;
}

function pianificaSequenza(state, oggi) {
  const imp = state.impostazioni;
  const gr = imp.giorniRipasso ?? 3;
  const esami = esamiAttivi(state, oggi).map(e => {
    const data = appelloScelto(e).data;
    return { e, data, inizioFinale: addDays(data, -gr), coda: compiti(state, e).filter(c => c.u > 0) };
  }).sort((a, b) => a.data.localeCompare(b.data));
  const blocchi = [];
  const add = (giorno, x, tipo, u, key = null, titolo = '') => {
    if (u <= 0) return;
    const id = `${giorno}|${x.e.id}|${tipo}|${key ?? ''}`;
    const old = blocchi.find(b => b.id === id);
    if (old) { old.ore += u / U; return; }
    blocchi.push({ id, giorno, esameId: x.e.id, tipo, argomentoId: key, titolo, ore: u / U, fatto: false });
  };
  if (!esami.length) return { blocchi, mancanti: {}, previste: {} };
  const giorni = Math.max(0, diffDays(oggi, esami[esami.length - 1].data));
  const fattoOggi = (state.fatti ?? []).filter(b => b.giorno === oggi).reduce((a, b) => a + b.ore, 0);
  // Capacità di ogni giorno; i giorni di ripasso finale sono riservati al loro esame (per gli altri valgono 0)
  const capU = [], riservato = [];
  for (let i = 0; i < giorni; i++) {
    const d = addDays(oggi, i);
    let c = toU(capacita(imp, d) - (i === 0 ? fattoOggi : 0));
    if (esami.some(x => x.data === d)) c = Math.floor(c / 2);   // giorno d'esame: mezza giornata per il prossimo
    capU.push(Math.max(0, c));
    riservato.push(esami.find(x => d >= x.inizioFinale && d < x.data) ?? null);
  }
  const libera = i => (riservato[i] ? 0 : capU[i]);
  const idx = d => Math.max(0, Math.min(giorni, diffDays(oggi, d)));
  const resto = x => x.coda.reduce((a, c) => a + c.u, 0);
  /** Usa fino a u mezz'ore per l'esame x nel giorno d, nell'ordine dei suoi compiti. */
  const lavora = (d, x, u) => {
    let used = 0;
    while (used < u && x.coda.length) {
      const c = x.coda[0];
      const g = Math.min(u - used, c.u);
      add(d, x, c.tipo, g, c.key, c.titolo);
      c.u -= g;
      used += g;
      if (c.u <= 0) x.coda.shift();
    }
    return used;
  };
  // Quando cominciare ogni esame: il giorno dopo l'esame precedente (il primo subito), così non restano settimane
  // vuote; prima solo se aspettando non ci starebbe (il più tardi possibile all'indietro, meno un margine).
  const libere = Array.from({ length: giorni }, (_, i) => libera(i));
  const inizi = {};
  for (const x of [...esami].reverse()) {
    let need = resto(x), k = idx(x.inizioFinale) - 1;
    for (; k >= 0 && need > 0; k--) { const g = Math.min(libere[k], need); libere[k] -= g; need -= g; }
    const tardi = Math.max(0, k + 1);
    x.inizio = Math.max(0, tardi - Math.max(5, Math.round((idx(x.inizioFinale) - tardi) * 0.25)));
  }
  const conLavoro = esami.filter(x => x.coda.length);
  conLavoro.forEach((x, n) => {
    if (n === 0) x.inizio = 0;
    else x.inizio = Math.min(x.inizio, idx(conLavoro[n - 1].data) + 1);
    inizi[x.e.id] = addDays(oggi, x.inizio);
  });
  /**
   * Nessun giorno di studio vuoto mentre si prepara un esame: almeno un'ora. Prima si porta avanti il lavoro che
   * resta; se è già tutto fatto, un altro giro di ripasso e quiz alternati sulle stesse lezioni.
   */
  const almenoUnOra = (i, d, cap) => {
    if (cap < 2 || cap < capU[i]) return;   // solo nei giorni rimasti vuoti
    const x = esami.find(y => y.data > d && d < y.inizioFinale && i >= y.inizio);
    if (!x) return;
    if (x.coda.length) {
      const fatto = lavora(d, x, 2);
      if (x.credito != null) x.credito = Math.max(0, x.credito - fatto);
      return;
    }
    x.giro ??= compiti(state, x.e).filter(c => c.tipo === 'ripasso' || c.tipo === 'quiz');
    if (!x.giro.length) return;
    x.gi ??= 0;
    const c = x.giro[x.gi % x.giro.length], n = Math.floor(x.gi / x.giro.length) + 2;
    x.gi++;
    add(d, x, c.tipo, 2, `${c.key}+${n}`, `${c.titolo} (${n === 2 ? 'secondo' : n === 3 ? 'terzo' : `${n}°`} giro)`);
  };
  const insieme = {};   // esami preparati insieme al precedente (perché aspettando non ci starebbero): giorno di inizio
  for (let i = 0; i < giorni; i++) {
    const d = addDays(oggi, i);
    let cap = capU[i];
    if (cap <= 0) continue;
    // Ultimi giorni prima di un esame: solo lui, ripasso generale e quiz veloci
    if (riservato[i]) { add(d, riservato[i], 'finale', cap, null, 'Ripasso generale e quiz veloci su tutto il programma'); continue; }
    const aperti = esami.filter(x => x.data > d && d < x.inizioFinale && x.coda.length && i >= x.inizio);
    const [p, s] = aperti;
    if (!p) { almenoUnOra(i, d, cap); continue; }
    // Il secondo esame parte insieme al primo solo se, aspettando che il primo finisca, non farebbe in tempo
    let quotaS = 0;
    if (s) {
      let j = i, acc = 0;
      const fineP = idx(p.inizioFinale), fineS = idx(s.inizioFinale);
      while (j < fineP && acc < resto(p)) acc += libera(j++);
      let dopo = 0;
      for (let k = j; k < fineS; k++) dopo += libera(k);
      const manca = resto(s) - dopo;
      if (manca > 0) {
        let giorniInsieme = 0;
        for (let k = i; k < j; k++) if (libera(k) > 0) giorniInsieme++;
        quotaS = Math.min(Math.floor(cap / 2), Math.ceil(manca / Math.max(1, giorniInsieme)));   // al massimo metà giornata: il primo ha la precedenza
        insieme[s.e.id] ??= d;
      }
    }
    // Il lavoro si spalma in modo regolare fino agli ultimi giorni (o fino a quando deve partire il prossimo esame):
    // niente giornate piene seguite da settimane vuote. Quota del giorno in proporzione alle ore libere che restano;
    // se è meno di un'ora si accumula, così le sedute durano almeno un'ora.
    let quotaP = cap - quotaS;
    const dopo = esami[esami.indexOf(p) + 1];
    let fine = idx(p.inizioFinale);
    if (dopo && dopo.inizio > i) fine = Math.min(fine, dopo.inizio);
    let somma = 0;
    for (let k = i; k < fine; k++) somma += libera(k);
    if (somma > resto(p)) {
      p.credito = (p.credito ?? 0) + (cap * resto(p)) / somma;
      quotaP = Math.min(quotaP, p.credito >= 2 ? Math.round(p.credito) : 0);
    }
    const fatto = lavora(d, p, quotaP);
    if (p.credito != null) p.credito = Math.max(0, p.credito - fatto);
    cap -= fatto;
    if (s && cap > 0) cap -= lavora(d, s, cap);   // a s la sua quota (più quello che avanza se p ha finito)
    for (const x of aperti.slice(2)) if (cap > 0) cap -= lavora(d, x, cap);
    almenoUnOra(i, d, cap);
  }
  const mancanti = {}, previste = {};
  for (const x of esami) {
    previste[x.e.id] = oreTotali(x.e);
    const m = resto(x) / U;
    if (m >= 1) mancanti[x.e.id] = Math.round(m);
  }
  blocchi.sort((a, b) => a.giorno.localeCompare(b.giorno));
  return { blocchi, mancanti, previste, insieme, inizi };
}
