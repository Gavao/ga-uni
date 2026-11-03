// Piano di studio: da oggi fino all'ultimo esame, giorno per giorno. Si lavora a mezz'ore (unità) per non
// avere arrotondamenti strani. Le ore di ogni esame si dividono in: studio degli argomenti (più tempo ai
// difficili), ripassi a distanza crescente, simulazioni d'esame e ripasso finale negli ultimi giorni.
import { addDays, diffDays, weekday } from './date.js';

export const QUOTE = { studio: 0.6, ripasso: 0.15, simulazione: 0.1, finale: 0.15 };
export const PESO = { facile: 1, medio: 1.5, difficile: 2.2 };
export const RIPASSI = [1, 3, 7, 14];         // giorni dopo aver finito un argomento
export const TIPI = {
  studio: ['📖', 'Studio'], ripasso: ['🔁', 'Ripasso'], simulazione: ['📝', 'Simulazione d\'esame'], finale: ['🎯', 'Ripasso generale'],
};
const U = 2;                                   // unità per ora (mezz'ore)
const toU = h => Math.round(h * U);

/** Appello scelto per l'esame (o null). */
export const appelloScelto = e => e.appelli.find(a => a.id === e.scelta) ?? null;
/** Ore di studio previste per l'esame: CFU × ore per CFU, meno la parte già studiata. */
export const oreTotali = e => Math.round(e.cfu * (e.oreCfu ?? 25) * (1 - (e.giaStudiato ?? 0) / 100));
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
  if (e.argomenti?.length) return e.argomenti;
  const n = Math.max(3, Math.round(e.cfu / 1.5));
  return Array.from({ length: n }, (_, k) => ({ id: `auto${k + 1}`, titolo: `Parte ${k + 1} di ${n}`, difficolta: 'medio', fattoIl: e.autoFatti?.[`auto${k + 1}`] ?? null, auto: true }));
}

/** Ore già fatte (blocchi segnati) per esame e tipo, e per argomento. */
export function oreFatte(state, esameId) {
  const out = { totale: 0, studio: 0, ripasso: 0, simulazione: 0, finale: 0, argomenti: {}, ripassiArg: {} };
  const all = [...(state.fatti ?? []), ...(state.piano?.blocchi ?? []).filter(b => b.fatto)];
  for (const b of all) {
    if (b.esameId !== esameId) continue;
    out.totale += b.ore;
    out[b.tipo] = (out[b.tipo] ?? 0) + b.ore;
    if (b.argomentoId && b.tipo === 'studio') out.argomenti[b.argomentoId] = (out.argomenti[b.argomentoId] ?? 0) + b.ore;
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
    const coda = args.filter(t => !t.fattoIl).map(t => ({ t, rest: Math.max(1, toU(target[t.id]) - toU(fatte.argomenti[t.id] ?? 0)) }));
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
  state.piano = { creatoIl: oggi, blocchi: r.blocchi, mancanti: r.mancanti };
  return r;
}

/** Segna un blocco fatto (o non fatto). Quando le ore di studio di un argomento sono finite, l'argomento è "fatto". */
export function segnaFatto(state, blocco, fatto, oggi) {
  blocco.fatto = fatto;
  if (blocco.tipo !== 'studio' || !blocco.argomentoId) return;
  const e = state.esami.find(x => x.id === blocco.esameId);
  if (!e) return;
  const target = oreArgomenti(e)[blocco.argomentoId] ?? 0;
  const fatte = oreFatte(state, e.id).argomenti[blocco.argomentoId] ?? 0;
  const finito = fatte >= target - 0.25;
  const giorno = blocco.giorno <= oggi ? blocco.giorno : oggi;
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
