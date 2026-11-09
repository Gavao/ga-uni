// Ripasso guidato: schede con i concetti chiave, domande "a carta girata", quiz e simulazioni d'esame.
// Il materiale (preso dalle dispense) arriva solo dal file privato della Pegaso: state.pegaso.schede[codice][n] =
// { p: [concetti chiave], d: [[domanda, risposta]], q: [[domanda, [opzioni], indice giusta, spiegazione]] }.
import { REGOLE } from './pegaso.js';
import { lezioniProva, TIPI } from './pianifica.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mescola = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

export const schedeDi = (state, e) => state.pegaso?.schede?.[e?.codice?.toUpperCase()] ?? null;
const STUDIO = ['ripasso', 'quiz', 'simulazione', 'finale'];
/** Il blocco ha un ripasso guidato? (esame con le schede caricate e blocco di ripasso, quiz o simulazione) */
export const haStudio = (state, b, e) => STUDIO.includes(b.tipo) && !!lezioniBlocco(e, b).some(n => schedeDi(state, e)?.[n]);

/** Numeri delle lezioni di un blocco: dal gruppo ("R1-6", "Q18-35+2"), o tutte quelle della prova. */
export function lezioniBlocco(e, b) {
  const m = /^[RQ](\d+)-(\d+)/.exec(b.argomentoId ?? '');
  if (m) return Array.from({ length: +m[2] - +m[1] + 1 }, (_, i) => +m[1] + i);
  return (lezioniProva(e) ?? e.lezioni ?? []).map(l => l.n);
}

let sess = null;   // quiz in corso: { id, domande, risposte, simulazione, consegnato, fine }
let timer = null;

function nuovaSessione(state, e, b) {
  const sc = schedeDi(state, e) ?? {};
  const pool = lezioniBlocco(e, b).flatMap(n => (sc[n]?.q ?? []).map(([q, opz, giusta, sp]) => ({ n, q, opz, giusta, sp })));
  const simulazione = b.tipo === 'simulazione';
  const quante = simulazione ? REGOLE.intermedia.domande : b.tipo === 'finale' ? 20 : 15;
  // Domande da lezioni diverse il più possibile: si prende a turno da ogni lezione
  const perLez = {};
  for (const d of mescola(pool)) (perLez[d.n] ??= []).push(d);
  const scelte = [];
  const liste = mescola(Object.values(perLez));
  while (scelte.length < quante && liste.some(l => l.length)) for (const l of liste) if (l.length && scelte.length < quante) scelte.push(l.pop());
  const domande = mescola(scelte).map(d => {
    const ordine = mescola(d.opz.map((_, i) => i));
    return { ...d, opz: ordine.map(i => d.opz[i]), giusta: ordine.indexOf(d.giusta) };
  });
  return { id: b.id, domande, risposte: domande.map(() => null), simulazione, consegnato: !simulazione, fine: simulazione ? Date.now() + REGOLE.intermedia.minuti * 60000 : null };
}

/** Pagina del ripasso guidato per il blocco b dell'esame e. */
export function pageStudia(view, state, e, b) {
  clearInterval(timer);
  const sc = schedeDi(state, e) ?? {};
  const lez = lezioniBlocco(e, b);
  const [emoji, label] = TIPI[b.tipo] ?? ['📖', 'Studio'];
  const titolo = n => e.lezioni?.find(l => l.n === n)?.titolo ?? `Lezione ${n}`;
  const head = `<header class="top"><a class="back" href="#/">‹</a><h1>${emoji} ${esc(label)}<small>${esc(e.nome)} · ${esc(b.titolo || '')}</small></h1></header>`;

  if (b.tipo === 'ripasso') {
    view.innerHTML = `${head}
      <p class="note">📌 Come fare: per ogni lezione leggi la scheda, poi copri e rispondi <b>a voce</b> alle domande; tocca per vedere la risposta. Se una non ti torna, riapri la dispensa su quel punto. Circa ${Math.max(5, Math.round((b.ore * 60) / Math.max(1, lez.length)))} minuti a lezione.</p>
      ${lez.map(n => {
        const s = sc[n];
        if (!s) return `<div class="card studio"><h3>${esc(titolo(n))}</h3><p class="note">Scheda non ancora caricata: ripassa dalla dispensa.</p></div>`;
        return `<div class="card studio"><h3>${esc(titolo(n))}</h3>
          <ul class="punti">${(s.p ?? []).map(p => `<li>${esc(p)}</li>`).join('')}</ul>
          ${(s.d ?? []).length ? `<div class="kicker">Rispondi a voce</div>${s.d.map(([q, a]) => `<details class="flash"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}` : ''}</div>`;
      }).join('')}
      <button class="primary" data-stfatto>✓ Ripasso fatto</button>`;
    return;
  }

  if (!sess || sess.id !== b.id) sess = nuovaSessione(state, e, b);
  const { domande, risposte, simulazione, consegnato } = sess;
  if (!domande.length) { view.innerHTML = `${head}<p class="note">Non ci sono ancora domande per queste lezioni.</p>`; return; }
  const giuste = risposte.filter((r, i) => r === domande[i].giusta).length;
  const date = risposte.filter(r => r != null).length;
  const finito = consegnato && date === domande.length || (simulazione && consegnato);
  const sbagliate = [...new Set(domande.filter((d, i) => consegnato && risposte[i] !== d.giusta).map(d => d.n))].sort((a, z) => a - z);
  const esito = !finito ? '' : simulazione
    ? `<div class="card hero" style="--c:${giuste >= REGOLE.intermedia.minimo ? 'var(--green)' : 'var(--red)'}"><div class="kicker">Risultato</div><div class="count">${giuste}/${domande.length}</div>
        <p class="note">${giuste >= REGOLE.intermedia.minimo ? `✅ Superata (servono ${REGOLE.intermedia.minimo} risposte giuste).` : `❌ Non ancora: servono ${REGOLE.intermedia.minimo} risposte giuste.`}</p></div>`
    : `<div class="card hero"><div class="kicker">Risultato</div><div class="count">${giuste}/${domande.length}</div></div>`;
  view.innerHTML = `${head}
    ${simulazione && !consegnato ? `<div class="card timer"><b id="stTimer"></b><small>${REGOLE.intermedia.domande} domande · ${REGOLE.intermedia.minuti} minuti · servono ${REGOLE.intermedia.minimo} giuste</small></div>` : ''}
    ${!simulazione ? `<p class="note">Tocca la risposta: vedi subito se è giusta e perché. ${date}/${domande.length} fatte · ${giuste} giuste.</p>` : ''}
    ${esito}
    ${finito && sbagliate.length ? `<p class="note">🔁 Da rivedere: ${sbagliate.map(n => `lez. ${n}`).join(', ')}.</p>` : ''}
    ${domande.map((d, i) => {
      const r = risposte[i];
      const mostra = consegnato && (r != null || simulazione);
      return `<div class="card domanda"><div class="kicker">Domanda ${i + 1} · lez. ${d.n}</div><b>${esc(d.q)}</b>
        <div class="opz">${d.opz.map((o, k) => `<button class="${mostra && k === d.giusta ? 'giusta' : ''} ${mostra && k === r && r !== d.giusta ? 'sbagliata' : ''} ${!mostra && k === r ? 'scelta' : ''}" data-stopz="${i}|${k}" ${mostra ? 'disabled' : ''}>${esc(o)}</button>`).join('')}</div>
        ${mostra && d.sp ? `<p class="note">${r === d.giusta ? '✅' : r == null ? '⏱️' : '❌'} ${esc(d.sp)}</p>` : ''}</div>`;
    }).join('')}
    ${simulazione && !consegnato ? '<button class="primary" data-stconsegna>Consegna</button>' : ''}
    ${finito ? `<button class="primary" data-stfatto>✓ Fatto</button><button class="secondary wide" data-strifai>🔄 Altre domande</button>` : ''}`;
  if (simulazione && !consegnato) {
    const tick = () => {
      const s = Math.max(0, Math.round((sess.fine - Date.now()) / 1000));
      const el = document.getElementById('stTimer');
      if (el) el.textContent = `⏱️ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (s <= 0) { clearInterval(timer); sess.consegnato = true; pageStudia(view, state, e, b); }
    };
    tick();
    timer = setInterval(tick, 1000);
  }
}

/** Tocchi nella pagina del ripasso guidato. Restituisce true se li ha gestiti. */
export function clickStudia(t, view, state, e, b, fatto) {
  const on = s => t.closest(s);
  let el;
  if ((el = on('[data-stopz]'))) {
    const [i, k] = el.dataset.stopz.split('|').map(Number);
    if (!sess || (sess.consegnato && sess.risposte[i] != null)) return true;
    sess.risposte[i] = k;
    pageStudia(view, state, e, b);
    return true;
  }
  if (on('[data-stconsegna]')) {
    const vuote = sess.risposte.filter(r => r == null).length;
    if (vuote && !confirm(`Mancano ${vuote} risposte. Consegnare lo stesso?`)) return true;
    clearInterval(timer);
    sess.consegnato = true;
    pageStudia(view, state, e, b);
    scrollTo(0, 0);
    return true;
  }
  if (on('[data-strifai]')) { sess = nuovaSessione(state, e, b); pageStudia(view, state, e, b); scrollTo(0, 0); return true; }
  if (on('[data-stfatto]')) { clearInterval(timer); sess = null; fatto(); return true; }
  return false;
}
export const fermaStudio = () => clearInterval(timer);
