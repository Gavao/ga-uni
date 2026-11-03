// Esami: scelta automatica degli appelli, avvisi (conflitti, esami ravvicinati, prenotazioni), media e CFU.
import { addDays, diffDays, ddmm } from './date.js';
import { appelloScelto, oreTotali, capacita, QUOTE } from './pianifica.js';

/** Si può ancora scegliere quell'appello? (nel futuro, e prenotabile o già prenotato) */
export const appelloValido = (a, oggi) => a.data > oggi && (a.prenotato || !a.chiusuraPren || a.chiusuraPren >= oggi);

/**
 * Proposta automatica: per ogni esame senza voto sceglie un appello (o "salta" se proprio non ce n'è) in modo
 * da evitare due esami lo stesso giorno, distanziare il più possibile gli esami vicini e lasciare abbastanza
 * ore di studio prima di ognuno. Le scelte fatte a mano (sceltaManuale) restano com'erano.
 * Restituisce le scelte { esameId: appelloId | 'salta' } senza modificare lo stato.
 */
export function proponiAppelli(state, oggi) {
  const imp = state.impostazioni;
  const gr = imp.giorniRipasso ?? 3;
  const esami = state.esami.filter(e => !e.esito);
  const opzioni = esami.map(e => {
    const fisso = e.sceltaManuale && (e.scelta === 'salta' || e.appelli.some(a => a.id === e.scelta && appelloValido(a, oggi)));
    if (fisso) return [e.scelta];
    const ok = e.appelli.filter(a => appelloValido(a, oggi)).map(a => a.id);
    return [...ok, 'salta'];
  });
  const data = (i, s) => (s === 'salta' ? null : esami[i].appelli.find(a => a.id === s).data);
  // Capacità cumulata (ore) da oggi a un giorno: per stimare se le ore di studio ci stanno
  const orizzonte = esami.flatMap(e => e.appelli.map(a => a.data)).sort().pop() ?? oggi;
  const n = Math.max(0, diffDays(oggi, orizzonte)) + 1;
  const cum = [0];
  for (let i = 0; i < n; i++) cum.push(cum[i] + capacita(imp, addDays(oggi, i)));
  const capFino = d => cum[Math.max(0, Math.min(n, diffDays(oggi, d)))];
  const lavoro = esami.map(e => oreTotali(e) * (1 - QUOTE.finale));

  function punteggio(sc) {
    const scelti = sc.map((s, i) => ({ i, d: data(i, s) })).filter(x => x.d).sort((a, b) => a.d.localeCompare(b.d));
    let p = -10000 * sc.filter(s => s === 'salta').length;
    // Ore che non ci stanno (cumulate, esame dopo esame)
    let somma = 0;
    for (const x of scelti) {
      somma += lavoro[x.i];
      p -= Math.max(0, somma - capFino(addDays(x.d, -gr)));
    }
    // Distanza tra esami consecutivi: conta molto finché sono vicini, poco quando sono già lontani
    for (let k = 1; k < scelti.length; k++) p += 15 * Math.sqrt(Math.min(14, diffDays(scelti[k - 1].d, scelti[k].d)));
    // A parità: appello più tardi (più tempo per studiare)
    for (const x of scelti) p += 0.01 * diffDays(oggi, x.d);
    return p;
  }

  let best = null, bestP = -Infinity;
  const sc = [];
  const usati = new Set();
  (function cerca(i) {
    if (i === esami.length) { const p = punteggio(sc); if (p > bestP) { bestP = p; best = [...sc]; } return; }
    const liberi = opzioni[i].filter(s => s !== 'salta' && !usati.has(data(i, s)));
    for (const s of opzioni[i]) {
      const d = data(i, s);
      if (d && usati.has(d)) continue;   // due esami lo stesso giorno: no
      if (s === 'salta' && liberi.length && !esami[i].sceltaManuale) continue;   // si salta solo se non c'è altro
      sc.push(s);
      if (d) usati.add(d);
      cerca(i + 1);
      if (d) usati.delete(d);
      sc.pop();
    }
  })(0);
  return Object.fromEntries(esami.map((e, i) => [e.id, best?.[i] ?? 'salta']));
}

/** Applica la proposta agli esami non bloccati a mano. */
export function applicaProposta(state, oggi) {
  const p = proponiAppelli(state, oggi);
  for (const e of state.esami) if (p[e.id] && !e.sceltaManuale) e.scelta = p[e.id];
  return p;
}

/** Stato della prenotazione di un appello. */
export function statoPrenotazione(a, oggi) {
  if (a.prenotato) return { k: 'prenotato', testo: 'Prenotato ✓' };
  if (a.data <= oggi) return { k: 'passato', testo: 'Appello passato' };
  if (a.aperturaPren && oggi < a.aperturaPren) return { k: 'futura', testo: `Prenotazioni dal ${ddmm(a.aperturaPren)}`, giorni: diffDays(oggi, a.aperturaPren) };
  if (a.chiusuraPren && oggi > a.chiusuraPren) return { k: 'chiusa', testo: 'Prenotazioni chiuse' };
  const giorni = a.chiusuraPren ? diffDays(oggi, a.chiusuraPren) : null;
  return { k: 'aperta', testo: a.chiusuraPren ? `Prenota entro il ${ddmm(a.chiusuraPren)}` : 'Prenotazioni aperte', giorni };
}

/**
 * Avvisi da mostrare: { livello: 'rosso' | 'arancio' | 'verde' | 'info', esameId, testo }.
 * piano: il risultato di pianifica (per le ore che non ci stanno).
 */
export function avvisi(state, oggi, piano) {
  const out = [];
  const nome = e => e.nome;
  const scelti = state.esami.filter(e => !e.esito && appelloScelto(e) && appelloScelto(e).data >= oggi)
    .map(e => ({ e, a: appelloScelto(e) })).sort((x, y) => x.a.data.localeCompare(y.a.data));
  // Stesso giorno e troppo vicini
  for (let k = 1; k < scelti.length; k++) {
    const p = scelti[k - 1], q = scelti[k], gap = diffDays(p.a.data, q.a.data);
    if (gap === 0) out.push({ livello: 'rosso', esameId: q.e.id, testo: `${nome(p.e)} e ${nome(q.e)} sono lo stesso giorno (${ddmm(q.a.data)}): scegli un altro appello.` });
    else if (gap <= 2) out.push({ livello: 'arancio', esameId: q.e.id, testo: `Solo ${gap} ${gap === 1 ? 'giorno' : 'giorni'} tra ${nome(p.e)} e ${nome(q.e)}.` });
  }
  // Ore che non ci stanno
  for (const [id, ore] of Object.entries(piano?.mancanti ?? {})) {
    const e = state.esami.find(x => x.id === id);
    if (e) out.push({ livello: 'rosso', esameId: id, deficit: true, testo: `${nome(e)}: mancano circa ${ore} h di studio prima dell'esame. Aumenta le ore al giorno, riduci una pausa o scegli un appello più avanti.` });
  }
  // Prenotazioni
  for (const { e, a } of scelti) {
    const st = statoPrenotazione(a, oggi);
    if (st.k === 'aperta') out.push({ livello: st.giorni != null && st.giorni <= 2 ? 'rosso' : 'verde', esameId: e.id, prenota: true, testo: `${nome(e)} (${ddmm(a.data)}): ${st.testo}${st.giorni === 0 ? ' (oggi!)' : st.giorni === 1 ? ' (domani)' : ''}.` });
    if (st.k === 'futura' && st.giorni <= 7) out.push({ livello: 'info', esameId: e.id, testo: `${nome(e)} (${ddmm(a.data)}): ${st.testo.toLowerCase()}.` });
    if (st.k === 'chiusa') out.push({ livello: 'rosso', esameId: e.id, testo: `${nome(e)} (${ddmm(a.data)}): prenotazioni chiuse e non hai prenotato. Scegli un altro appello.` });
  }
  // Esami passati senza voto
  for (const e of state.esami) {
    const a = appelloScelto(e);
    if (!e.esito && a && a.data <= oggi && a.data >= addDays(oggi, -30)) out.push({ livello: 'info', esameId: e.id, testo: `Com'è andato ${nome(e)}? Inserisci il voto (o scegli un altro appello).` });
  }
  const ord = { rosso: 0, arancio: 1, verde: 2, info: 3 };
  const peso = a => ord[a.livello] + (a.prenota && a.livello === 'rosso' ? -1 : 0);   // prenotazioni in scadenza prima di tutto
  return out.sort((x, y) => peso(x) - peso(y));
}

/** CFU e media ponderata (la lode vale 30 nella media). */
export function carriera(state) {
  const superati = state.esami.filter(e => e.esito);
  const cfu = superati.reduce((a, e) => a + e.cfu, 0);
  const tot = state.esami.reduce((a, e) => a + e.cfu, 0);
  const media = cfu ? superati.reduce((a, e) => a + e.esito.voto * e.cfu, 0) / cfu : null;
  return { cfu, tot, media, base110: media != null ? (media * 110) / 30 : null, lodi: superati.filter(e => e.esito.lode).length, superati: superati.length };
}
