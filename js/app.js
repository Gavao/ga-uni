// GAUNI: esami universitari e piano di studio. Tutto resta nel telefono (localStorage), con backup in JSON.
// Pagine: Oggi (cosa studiare), Esami (appelli, prenotazioni, voti), Calendario (settimana/mese), Altro.
import { APP_VERSION } from './version.js';
import { carica, salva, statoIniziale, backup, ripristina } from './store.js';
import { today, addDays, diffDays, weekday, ddmm, ddmmyyyy, longDate, shortDate, relDays, monthName, GIORNI_BREVI } from './date.js';
import { leggiImport, unisci, leggiArgomenti, importaPegaso, ISTRUZIONI_CLAUDE, ISTRUZIONI_ARGOMENTI, COLORI, uid } from './importa.js';
import { REGOLE, lezioniFinale, frequenza } from './pegaso.js';
import { ripianifica, segnaFatto, oreIndietro, oreTotali, oreFatte, argomentiDi, appelloScelto, capacita, oreNecessarie, lezioniProva, fasi, QSEQ, TIPI } from './pianifica.js';
import { applicaProposta, avvisi, carriera, statoPrenotazione, appelloValido } from './esami.js';
import { creaIcs } from './ics.js';
import { pageStudia, clickStudia, haStudio, fermaStudio } from './studia.js';

const $ = s => document.querySelector(s);
const view = $('#view');
const sheet = $('#sheet');
const native = window.Android;   // guscio Android (APK): salva e condivide i file al posto del browser
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ore = h => `${String(Math.round(h * 10) / 10).replace('.', ',')} h`;
const fmtMedia = m => (m == null ? '—' : m.toFixed(2).replace('.', ','));

let S = carica();
let oggi = today();
let cal = { modo: 'mese', rif: oggi };
let anteprima = null;   // import in attesa di conferma
let giornoAperto = null; // giorno mostrato nella finestra del calendario

if (!S) {   // primo avvio: esami di partenza, appelli proposti, piano pronto
  S = statoIniziale();
  applicaProposta(S, oggi);
  ripianifica(S, oggi);
  salva(S);
}

function toast(text, ms = 3200) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.hidden = true; }, ms);
}
/** Dopo ogni modifica a esami o impostazioni: piano rifatto da oggi (il lavoro fatto resta) e salvataggio. */
function aggiorna(msg) {
  ripianifica(S, oggi);
  salva(S);
  if (msg) toast(msg);
  render();
}
const esame = id => S.esami.find(e => e.id === id);
const avvisiOra = () => avvisi(S, oggi, S.piano);

// ---------------------------------------------------------------- Oggi
function pageOggi() {
  const prossimi = S.esami.filter(e => !e.esito && appelloScelto(e) && appelloScelto(e).data >= oggi).sort((a, b) => appelloScelto(a).data.localeCompare(appelloScelto(b).data));
  const next = prossimi[0];
  const tutti = avvisiOra();
  const av = tutti.filter(a => !a.deficit && !(a.frequenza && a.giorni > 30));   // ore che mancano: un riepilogo qui sotto; frequenza: solo le scadenze vicine
  const need = tutti.some(a => a.deficit) ? oreNecessarie(S, oggi) : null;
  const c = carriera(S);
  const indietro = oreIndietro(S, oggi);
  const oggiBlocchi = [
    ...(S.fatti ?? []).map((b, i) => ({ ...b, fatto: true, storico: i })).filter(b => b.giorno === oggi),
    ...(S.piano?.blocchi ?? []).filter(b => b.giorno === oggi),
  ];
  const tot = oggiBlocchi.reduce((a, b) => a + b.ore, 0), fatto = oggiBlocchi.filter(b => b.fatto).reduce((a, b) => a + b.ore, 0);
  const domani = (S.piano?.blocchi ?? []).filter(b => b.giorno === addDays(oggi, 1));
  view.innerHTML = `<header class="top"><span class="brand">🎓</span><h1>GAUNI<small>${esc(longDate(oggi))}</small></h1></header>
    ${updateBanner()}
    ${next ? (() => {
      const a = appelloScelto(next), d = diffDays(oggi, a.data), fo = oreFatte(S, next.id);
      // Con il metodo a fasi contano anche le videolezioni già viste sulla Pegaso
      const f = S.impostazioni.unoAllaVolta !== false ? Object.values(fasi(S, next)).reduce((s, x) => s + x.fatte, 0) + fo.finale : fo.totale;
      return `<a class="card hero" style="--c:${next.colore}" href="#/esame/${next.id}"><div class="kicker">Prossimo esame</div><h3>${esc(next.nome)}</h3>
        <div class="note">${esc(longDate(a.data))} alle ${a.ora} · ${next.cfu} CFU</div>
        <div class="count">${d === 0 ? 'Oggi!' : d === 1 ? 'Domani' : `${d} <small>giorni</small>`}</div>
        <div class="bar"><i style="width:${Math.min(100, (f / Math.max(1, oreTotali(next))) * 100)}%"></i></div><small class="note">${ore(f)} studiate su ${ore(oreTotali(next))} previste</small></a>`;
    })() : '<div class="card empty">Nessun esame in programma: scegli gli appelli in Esami.</div>'}
    ${av.length ? `<div class="alerts">${av.slice(0, 5).map(alertHtml).join('')}${av.length > 5 ? `<a class="note" href="#/esami">Altri ${av.length - 5} avvisi in Esami ›</a>` : ''}</div>` : ''}
    ${need ? riepilogoOre(need) : ''}
    ${indietro >= 0.5 ? `<div class="card behind"><span>⏰ Sei indietro di <b>${ore(indietro)}</b> rispetto al piano.</span><button class="secondary small" data-replan>Ripianifica</button></div>` : ''}
    <h2>Da studiare oggi <small>${tot ? `${ore(fatto)} / ${ore(tot)}` : ''}</small></h2>
    ${(() => { const ids = [...new Set(oggiBlocchi.filter(b => b.tipo !== 'finale').map(b => b.esameId))]; return ids.length > 1 && S.impostazioni.unoAllaVolta !== false ? '<p class="note">📌 Oggi due esami insieme: il secondo deve partire prima, altrimenti non ci staresti dentro.</p>' : ''; })()}
    ${oggiBlocchi.length ? `<div class="tasks">${oggiBlocchi.map(b => taskHtml(b)).join('')}</div>`
      : `<div class="empty">${capacita(S.impostazioni, oggi) ? (() => { const p = (S.piano?.blocchi ?? []).find(b => b.giorno > oggi); const e = p && esame(p.esameId); return e ? `Oggi libero 🎉 Si riparte ${relDays(oggi, p.giorno)} (${shortDate(p.giorno)}) con ${esc(e.nome)}.` : 'Niente in programma oggi 🎉'; })() : 'Oggi è giorno di riposo 😌'}</div>`}
    ${domani.length ? `<h2>Domani <small>${ore(domani.reduce((a, b) => a + b.ore, 0))}</small></h2><div class="tasks">${domani.map(b => taskHtml(b, true)).join('')}</div>` : ''}
    <h2>Carriera</h2>
    <div class="stats"><div class="stat"><b>${c.cfu}/${c.tot}</b><small>CFU</small></div><div class="stat"><b>${fmtMedia(c.media)}</b><small>media</small></div>
      <div class="stat"><b>${c.base110 == null ? '—' : Math.round(c.base110)}</b><small>su 110</small></div></div>`;
}
/** Le ore non bastano: quante ne servirebbero al giorno, e quali esami non ci stanno comunque. */
function riepilogoOre(need) {
  const imp = S.impostazioni;
  const nomi = need.impossibili.map(id => esame(id)?.nome).filter(Boolean);
  return `<div class="card" style="border-color:var(--orange)">
    ${need.ore > imp.oreGiorno ? `<p style="margin:0 0 8px">🟠 Con <b>${ore(imp.oreGiorno)} al giorno</b> non ci stai dentro: per tutti gli esami servirebbero circa <b>${ore(need.ore)} al giorno</b>.</p>
      <button class="secondary small" data-setore="${need.ore}">Studia ${ore(need.ore)} al giorno</button>` : ''}
    ${nomi.length ? `<p style="margin:8px 0 0">🔴 <b>${esc(nomi.join(', '))}</b>: le ore previste non entrano nemmeno studiando tutto il giorno. Se hai già seguito il corso, indica quanto hai già studiato nell'esame (le ore scendono), oppure scegli un appello più avanti.</p>` : ''}
    <p class="note">Le ore si calcolano dalle lezioni (2 h ciascuna tra video, dispensa e test): se ti basta meno tempo, cambialo nella pagina dell'esame.</p></div>`;
}
function alertHtml(a) {
  const e = esame(a.esameId);
  const btn = a.prenota ? `<button class="secondary small" data-booked="${a.esameId}">Prenotato</button>` : '';
  return `<div class="alert ${a.livello}"><span>${a.livello === 'rosso' ? '🔴' : a.livello === 'arancio' ? '🟠' : a.livello === 'verde' ? '🟢' : 'ℹ️'} ${esc(a.testo)}</span>${btn}${!btn && e ? `<a class="link" href="#/esame/${e.id}">›</a>` : ''}</div>`;
}
function taskHtml(b, readonly = false) {
  const e = esame(b.esameId);
  if (!e) return '';
  const [emoji, label] = TIPI[b.tipo] ?? ['•', b.tipo];
  const cosa = b.titolo || (b.tipo === 'studio' || b.tipo === 'ripasso' ? (b.argomentoId ? argomentiDi(e).find(t => t.id === b.argomentoId)?.titolo : '') || 'argomenti già studiati' : '');
  const key = b.storico != null ? `s${b.storico}` : `p${b.id}`;
  return `<${readonly ? 'div' : 'button'} class="task ${b.fatto ? 'done' : ''}" style="--c:${e.colore}" ${readonly ? '' : `data-task="${esc(key)}"`}>
    ${readonly ? '' : `<span class="check">${b.fatto ? '✓' : ''}</span>`}
    <span class="t-body"><b>${emoji} ${label}${cosa ? `: ${esc(cosa)}` : ''}</b><small>${esc(e.nome)}</small></span><span class="h">${ore(b.ore)}</span></${readonly ? 'div' : 'button'}>
    ${!readonly && b.storico == null && haStudio(S, b, e) ? `<a class="apri" style="--c:${e.colore}" href="#/studia/${encodeURIComponent(b.id)}">${b.tipo === 'ripasso' ? '📖 Apri schede e domande' : b.tipo === 'simulazione' ? '⏱️ Inizia la simulazione' : '🧠 Inizia il quiz'}</a>` : ''}`;
}

// ---------------------------------------------------------------- Esami
function pageEsami() {
  const data = e => appelloScelto(e)?.data ?? 'z';
  const daFare = S.esami.filter(e => !e.esito && e.appelli.length).sort((a, b) => data(a).localeCompare(data(b)));
  const senza = S.esami.filter(e => !e.esito && !e.appelli.length);
  const superati = S.esami.filter(e => e.esito);
  const av = avvisiOra().filter(a => !a.deficit);   // le ore che mancano si vedono nella scheda di ogni esame
  const c = carriera(S);
  view.innerHTML = `<header class="top"><span class="brand">🎓</span><h1>Esami<small>${c.cfu}/${c.tot} CFU · ${superati.length}/${S.esami.length} esami superati</small></h1></header>
    <button class="primary" data-propose>✨ Proponi gli appelli migliori</button>
    <p class="note">Sceglie per te: mai due esami lo stesso giorno, esami vicini il più distanti possibile, abbastanza ore di studio per ognuno. Le scelte fatte a mano (📌) restano.</p>
    ${av.length ? `<div class="alerts">${av.map(alertHtml).join('')}</div>` : ''}
    <h2>Con appelli <small>${daFare.length}</small></h2>${daFare.map(examCard).join('')}
    ${senza.length ? `<h2>Appelli non ancora pubblicati <small>${senza.length}</small></h2>${senza.map(examCard).join('')}` : ''}
    ${superati.length ? `<h2>Superati <small>media ${fmtMedia(c.media)}</small></h2>${superati.map(examCard).join('')}` : ''}`;
}
function examCard(e) {
  const a = appelloScelto(e);
  const f = oreFatte(S, e.id).totale, H = oreTotali(e);
  const args = argomentiDi(e), done = args.filter(t => t.fattoIl).length;
  if (e.esito) {
    return `<a class="exam passed" style="--c:${e.colore}" href="#/esame/${e.id}"><div class="exam-head"><b>${esc(e.nome)}</b><small>${e.cfu} CFU</small></div>
      <div class="sub">✅ Superato con <b>${e.esito.voto}${e.esito.lode ? ' e lode' : ''}</b>${e.esito.data ? ` il ${ddmmyyyy(e.esito.data)}` : ''}</div></a>`;
  }
  if (!e.appelli.length) {
    return `<a class="exam" style="--c:${e.colore}" href="#/esame/${e.id}"><div class="exam-head"><b>${esc(e.nome)}</b><small>${e.cfu} CFU ›</small></div>
      <div class="sub">${e.anno ? `${e.anno}° anno · ` : ''}${e.lezioni ? `${e.lezioni.filter(l => l.fattoIl).length}/${e.lezioni.length} lezioni` : 'nessun appello per ora'}</div></a>`;
  }
  const chips = e.appelli.map(x => {
    const st = statoPrenotazione(x, oggi);
    const valid = appelloValido(x, oggi);
    return `<button class="chip ${x.id === e.scelta ? 'on' : ''} ${valid ? '' : 'off'}" data-pick="${e.id}|${x.id}" ${valid || x.id === e.scelta ? '' : 'disabled'}>${shortDate(x.data)}${x.prenotato ? ' ✓' : ''}${st.k === 'aperta' && x.id === e.scelta ? ' ·🟢' : ''}</button>`;
  }).join('');
  return `<div class="exam" style="--c:${e.colore}"><a class="exam-head" href="#/esame/${e.id}"><b>${esc(e.nome)}${e.sceltaManuale ? ' 📌' : ''}</b><small>${e.cfu} CFU ›</small></a>
    <div class="chips">${chips}<button class="chip ${e.scelta === 'salta' ? 'on' : ''}" data-pick="${e.id}|salta">Salta</button></div>
    ${a ? `<div class="sub">${esc(longDate(a.data))} · ${relDays(oggi, a.data)} · ${esc(statoPrenotazione(a, oggi).testo)}</div>
      <div class="bar"><i style="width:${Math.min(100, (f / Math.max(1, H)) * 100)}%"></i></div>
      <div class="sub">${done}/${args.length} ${e.lezioni ? 'lezioni' : 'argomenti'} · ${ore(f)} di ${ore(H)}${frequenza(e) != null ? ` · frequenza ${frequenza(e)}%${frequenza(e) < REGOLE.frequenza ? ' (serve 70% per prenotare)' : ' ✓'}` : ''}${S.piano?.mancanti?.[e.id] ? ` · <span style="color:var(--red)">⚠️ mancano ~${S.piano.mancanti[e.id]} h</span>` : ''}</div>` : '<div class="sub">Non in programma</div>'}</div>`;
}

// ---------------------------------------------------------------- Dettaglio esame
function pageEsame(id) {
  const e = esame(id);
  if (!e) { location.hash = '#/esami'; return; }
  const H = oreTotali(e), f = oreFatte(S, e.id);
  const args = e.argomenti;
  const a = appelloScelto(e);
  const mancanti = S.piano?.mancanti?.[e.id];
  view.innerHTML = `<header class="top"><a class="back" href="#/esami">‹</a><h1>${esc(e.nome)}<small>${e.cfu} CFU${e.codice ? ` · ${esc(e.codice)}` : ''}</small></h1></header>
    ${e.esito ? `<div class="card hero" style="--c:${e.colore}"><div class="kicker">Superato</div><div class="count">${e.esito.voto}${e.esito.lode ? '<small> e lode</small>' : ''}</div>
      <button class="link" data-unpass="${e.id}">Annulla il voto</button></div>` : ''}
    <h2>Appelli</h2>
    <div class="list">${e.appelli.map(x => {
      const st = statoPrenotazione(x, oggi);
      return `<div class="row" style="--c:${e.colore}"><span><b>${x.id === e.scelta ? '👉 ' : ''}${esc(longDate(x.data))} · ${x.ora}</b>
        <small>${esc([x.tipo, x.modalita].filter(Boolean).join(' · '))}${x.aperturaPren ? `<br>Prenotazioni: dal ${ddmm(x.aperturaPren)} al ${ddmm(x.chiusuraPren ?? x.data)}` : ''}</small>
        <span class="badge ${st.k === 'aperta' ? (st.giorni <= 2 ? 'rosso' : 'verde') : st.k === 'prenotato' ? 'verde' : ''}">${esc(st.testo)}</span></span>
        <span class="inline" style="flex:none;flex-direction:column;gap:6px">
          ${x.id !== e.scelta && x.data > oggi ? `<button class="secondary small" data-pick="${e.id}|${x.id}">Scegli</button>` : ''}
          ${x.data > oggi ? `<button class="secondary small" data-book="${e.id}|${x.id}">${x.prenotato ? 'Annulla pren.' : 'Prenotato'}</button>` : ''}</span></div>`;
    }).join('')}
      <button class="secondary wide" data-pick="${e.id}|salta">${e.scelta === 'salta' ? '✓ Saltato' : 'Salta questo esame'}</button>
      ${e.sceltaManuale ? `<button class="link" data-unpin="${e.id}">📌 Scelta fatta a mano: lascia decidere all'app</button>` : ''}</div>

    ${e.lezioni ? sezionePegaso(e, H, f, mancanti) : `<h2>Studio <small>${ore(f.totale)} fatte di ${ore(H)}</small></h2>
    <div class="card" style="--c:${e.colore}">
      <div class="bar"><i style="width:${Math.min(100, (f.totale / Math.max(1, H)) * 100)}%"></i></div>
      ${mancanti ? `<p class="note" style="color:var(--red)">⚠️ Con il ritmo attuale mancano circa ${mancanti} h prima dell'esame.</p>` : ''}
      <label class="field"><span>Ore per CFU (di solito 25)</span><input type="number" min="5" max="40" step="1" value="${e.oreCfu}" data-ecfg="oreCfu|${e.id}"></label>
      <label class="field"><span>Già studiato / seguito: <b>${e.giaStudiato}%</b> (le ore previste scendono)</span><input type="range" min="0" max="90" step="10" value="${e.giaStudiato}" data-ecfg="giaStudiato|${e.id}"></label>
      <p class="note">Ore previste: ${e.cfu} CFU × ${e.oreCfu} h${e.giaStudiato ? ` − ${e.giaStudiato}%` : ''} = <b>${ore(H)}</b>. Studio ${ore(f.studio)}, ripassi ${ore(f.ripasso)}, simulazioni ${ore(f.simulazione)}, ripasso finale ${ore(f.finale)}.</p>
      ${faseHtml(e)}
    </div>

    <h2>Argomenti <small>${args.filter(t => t.fattoIl).length}/${args.length} fatti</small></h2>
    ${args.length ? `<div class="list">${args.map(t => `<div class="topic ${t.fattoIl ? 'done' : ''}" style="--c:${e.colore}">
      <button class="tick ${t.fattoIl ? 'on' : ''}" data-tdone="${e.id}|${t.id}">${t.fattoIl ? '✓' : ''}</button><span class="t">${esc(t.titolo)}</span>
      <button class="diff ${t.difficolta}" data-tdiff="${e.id}|${t.id}">${t.difficolta}</button><button class="x" data-tdel="${e.id}|${t.id}" aria-label="Togli">×</button></div>`).join('')}</div>`
      : '<p class="note">Ancora nessun argomento: il piano usa delle "parti" generiche. Incolla il programma qui sotto per un piano più preciso.</p>'}
    <label class="field"><span>Aggiungi argomenti (uno per riga; "(difficile)" o "(facile)" alla fine per la difficoltà)</span>
      <textarea id="newTopics" placeholder="Ricerca nello spazio degli stati (difficile)&#10;Logica proposizionale (facile)&#10;Reti bayesiane"></textarea></label>
    <div class="row-buttons"><button class="secondary" data-addtopics="${e.id}">Aggiungi</button><button class="secondary" data-copy="argomenti">📋 Istruzioni per Claude</button></div>
    <p class="note">Con "Istruzioni per Claude" copi una richiesta da incollare in Claude insieme al programma del corso: ti restituisce l'elenco pronto da incollare qui.</p>`}

    ${e.esito ? '' : `<h2>Esame superato?</h2>
      <div class="card"><div class="inline"><label class="field"><span>Voto</span><select id="voto">${Array.from({ length: 13 }, (_, i) => 30 - i).map(v => `<option>${v}</option>`).join('')}</select></label>
        <label class="check-line" style="margin-top:28px"><input type="checkbox" id="lode"> Lode</label></div>
        <button class="primary" data-pass="${e.id}">Salva il voto</button></div>`}
    <button class="link danger" data-delexam="${e.id}">Elimina questo esame</button>`;
  void a;
}

/** Le tre fasi (metodo "un esame alla volta"): videolezioni, ripasso di tutto, quiz e simulazioni. */
function faseHtml(e) {
  if (S.impostazioni.unoAllaVolta === false) return '';
  const f = fasi(S, e);
  const nomi = { 1: e.lezioni ? '📺 Videolezioni' : '📖 Primo studio', 2: '🔁 Ripasso + quiz', 3: '📝 Simulazioni' };
  const att = [1, 2, 3].find(k => f[k].fatte < f[k].tot - 0.25) ?? 3;
  const ins = S.piano?.insieme?.[e.id];
  return `<div class="fasi">${[1, 2, 3].map(k => `<div class="${k === att ? 'on' : ''}"><b>${nomi[k]}</b>
      <div class="bar"><i style="width:${Math.min(100, (f[k].fatte / Math.max(0.5, f[k].tot)) * 100)}%"></i></div><small>${ore(f[k].fatte)} di ${ore(f[k].tot)}</small></div>`).join('')}</div>
    <p class="note">🎯 Ultimi ${S.impostazioni.giorniRipasso} giorni: solo ripasso generale e quiz veloci (${ore(oreTotali(e) * QSEQ.finale)} circa).</p>
    ${ins ? `<p class="note">⚠️ Si prepara insieme all'esame precedente dal ${ddmm(ins)}: aspettando non ci staresti dentro.</p>` : ''}`;
}

/** Esame Pegaso: frequenza, com'è fatta la prova, ore per lezione e l'elenco delle videolezioni. */
function sezionePegaso(e, H, f, mancanti) {
  const freq = frequenza(e);
  const k = lezioniFinale(e.cfu), n = e.lezioni.length;
  const a = appelloScelto(e) ?? e.appelli[0];
  const intermedia = /intermedia/i.test(a?.tipo ?? '');
  const prova = lezioniProva(e);
  const fatte = e.lezioni.filter(l => l.fattoIl).length;
  const R = REGOLE;
  return `${freq == null ? `<h2>Frequenza</h2><div class="card"><p class="note">Per prenotare serve il ${R.frequenza}% di frequenza alle videolezioni. La tua non è ancora caricata: importa i dati della Pegaso (Altro → Importa) oppure segna le lezioni fatte qui sotto.</p></div>` : `<h2>Frequenza <small>${freq}% · serve il ${R.frequenza}% per prenotare</small></h2>
    <div class="card" style="--c:${freq >= R.frequenza ? 'var(--green)' : e.colore}">
      <div class="bar"><i style="width:${freq}%"></i></div>
      <p class="note">${freq >= R.frequenza ? '✓ Puoi prenotare le prove di questo esame.' : `Per prenotare devi arrivare al ${R.frequenza}%: circa ${Math.max(1, Math.ceil(((R.frequenza - freq) / 100) * n))} lezioni ancora da seguire in piattaforma.`}</p>
      ${(() => {   // lezioni con il video già visto ma non al 100%: basta cliccare "Obiettivi" e fare il test
        const meta = e.lezioni.filter(l => !l.fattoIl && l.visto > 0 && l.visto < 100);
        return meta.length && freq < R.frequenza ? `<p class="note">💡 In ${meta.length} lezioni (${meta[0].n}-${meta[meta.length - 1].n}) hai già visto il video: per portarle al 100% clicca su <b>Obiettivi</b> e fai il <b>test di fine lezione</b>. La frequenza sale subito.</p>` : '';
      })()}
      <p class="note">In piattaforma una lezione arriva al 100% solo se finisci il video, clicchi su "Obiettivi" e fai il test di fine lezione.</p>
    </div>`}
    <h2>Com'è l'esame</h2>
    <div class="card">
      <p style="margin:0 0 6px">${intermedia ? '👉 ' : ''}<b>Prova intermedia</b> (online): ${R.intermedia.domande} domande a risposta multipla in ${R.intermedia.minuti} minuti, servono almeno ${R.intermedia.minimo}/${R.intermedia.domande}. Lezioni 1-${n - k}. Vale ${R.intermedia.validita} giorni.</p>
      <p style="margin:0 0 6px"><b>Prova finale</b> (in presenza): ${R.finale.domande} domande in ${R.finale.minuti} minuti sulle ultime ${k} lezioni (${n - k + 1}-${n}); la 7ª vale la lode. Con la intermedia devi arrivare a 18/30.</p>
      <p style="margin:0 0 6px"><b>Prova unica</b> (tablet, in presenza): ${R.unica.domande} domande in ${R.unica.minuti} minuti su tutto il programma.</p>
      <p class="note">💡 Seguendo le lezioni in diretta (didattica sincrona) prendi fino a ${R.premiali} punti in più sulla prova intermedia.</p>
    </div>
    <h2>Studio <small>${ore(f.totale)} fatte di ${ore(H)}</small></h2>
    <div class="card" style="--c:${e.colore}">
      <div class="bar"><i style="width:${Math.min(100, (f.totale / Math.max(1, H)) * 100)}%"></i></div>
      ${mancanti ? `<p class="note" style="color:var(--red)">⚠️ Con il ritmo attuale mancano circa ${mancanti} h prima dell'esame.</p>` : ''}
      <label class="field"><span>Ore per lezione (video + dispensa + test di fine lezione)</span><input type="number" min="0.5" max="6" step="0.5" value="${e.oreLezione ?? 1.5}" data-ecfg="oreLezione|${e.id}"></label>
      <label class="field"><span>Già studiato / ripassato altrove: <b>${e.giaStudiato}%</b></span><input type="range" min="0" max="90" step="10" value="${e.giaStudiato}" data-ecfg="giaStudiato|${e.id}"></label>
      <p class="note">${prova.length} lezioni per ${intermedia ? 'la prova intermedia' : 'questa prova'} × ${ore(e.oreLezione ?? 1.5)} = <b>${ore(H)}</b> in tutto, compresi ripasso, quiz e ripasso finale.</p>
      ${faseHtml(e)}
    </div>
    <h2>Lezioni <small>${fatte}/${n} fatte</small></h2>
    <p class="note">Tocca ✓ quando hai finito una lezione (video, Obiettivi e test). La % è quanto avevi già visto in piattaforma. Tocca la difficoltà per cambiarla: le lezioni difficili hanno più tempo.</p>
    <div class="list">${e.lezioni.map((l, i) => `${i === n - k ? `<p class="note" style="margin-top:12px">⬇️ Ultime ${k} lezioni: programma della prova finale</p>` : ''}
      <div class="topic ${l.fattoIl ? 'done' : ''}" style="--c:${e.colore}${intermedia && i >= n - k ? ';opacity:.6' : ''}">
      <button class="tick ${l.fattoIl ? 'on' : ''}" data-tdone="${e.id}|L${l.n}">${l.fattoIl ? '✓' : ''}</button><span class="t">${l.n}. ${esc(l.titolo)}${!l.fattoIl && l.visto ? ` <small class="note">(${l.visto}%)</small>` : ''}</span>
      <button class="diff ${l.difficolta ?? 'medio'}" data-tdiff="${e.id}|L${l.n}">${l.difficolta ?? 'medio'}</button></div>`).join('')}</div>`;
}

// ---------------------------------------------------------------- Calendario
function pageCalendario() {
  const blocchi = [...(S.fatti ?? []).map(b => ({ ...b, fatto: true })), ...(S.piano?.blocchi ?? [])];
  const perGiorno = {};
  for (const b of blocchi) (perGiorno[b.giorno] ??= []).push(b);
  const esamiGiorno = {};
  for (const e of S.esami) { const a = appelloScelto(e); if (a && !e.esito) (esamiGiorno[a.data] ??= []).push(e); }
  const inPausa = d => (S.impostazioni.pause ?? []).some(p => p.da <= d && d <= p.a);
  const r = cal.rif;
  let body = '', titolo = '';
  if (cal.modo === 'mese') {
    const primo = `${r.slice(0, 7)}-01`;
    titolo = `${monthName(+r.slice(5, 7) - 1)} ${r.slice(0, 4)}`;
    const start = addDays(primo, -weekday(primo));
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i);
      if (i >= 35 && d.slice(5, 7) !== primo.slice(5, 7)) break;
      const ex = esamiGiorno[d]?.[0];
      const bl = perGiorno[d] ?? [];
      const perEsame = {};
      for (const b of bl) perEsame[b.esameId] = (perEsame[b.esameId] ?? 0) + b.ore;
      cells.push(`<button class="day ${d.slice(5, 7) !== primo.slice(5, 7) ? 'out' : ''} ${d === oggi ? 'today' : ''} ${ex ? 'exam-day' : ''} ${inPausa(d) ? 'pausa' : ''}" style="--c:${ex?.colore ?? 'transparent'}" data-day="${d}">
        <span class="n">${+d.slice(8)}</span><span class="bars">${Object.entries(perEsame).slice(0, 3).map(([id, h]) => `<i style="--c:${esame(id)?.colore};width:${Math.min(100, h * 20)}%"></i>`).join('')}</span></button>`);
    }
    body = `<div class="month">${GIORNI_BREVI.map(g => `<span class="dow">${g}</span>`).join('')}${cells.join('')}</div>`;
  } else {
    const lun = addDays(r, -weekday(r));
    titolo = `${ddmm(lun)} – ${ddmm(addDays(lun, 6))}`;
    body = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(lun, i);
      const ex = esamiGiorno[d] ?? [];
      const bl = perGiorno[d] ?? [];
      return `<div class="week-day ${d === oggi ? 'today' : ''}"><b>${esc(longDate(d, false))}${inPausa(d) ? ' · pausa' : ''}</b>
        ${ex.map(e => `<div class="alert" style="border-color:${e.colore}"><span>🎓 <b>Esame: ${esc(e.nome)}</b> alle ${appelloScelto(e).ora}</span></div>`).join('')}
        ${bl.length ? `<div class="tasks">${bl.map(b => taskHtml(b, d !== oggi)).join('')}</div>` : ex.length ? '' : '<small class="note">Niente</small>'}</div>`;
    }).join('');
  }
  const attivi = S.esami.filter(e => !e.esito && appelloScelto(e));
  view.innerHTML = `<header class="top"><span class="brand">🎓</span><h1>Calendario</h1></header>
    <div class="seg"><button class="${cal.modo === 'settimana' ? 'on' : ''}" data-calmode="settimana">Settimana</button><button class="${cal.modo === 'mese' ? 'on' : ''}" data-calmode="mese">Mese</button></div>
    <div class="cal-nav"><button class="icon" data-calmove="-1">‹</button><b>${esc(titolo)}</b><button class="icon" data-calmove="1">›</button></div>
    <button class="link" data-caltoday>Torna a oggi</button>
    ${body}
    <div class="legend">${attivi.map(e => `<span style="--c:${e.colore}">${esc(e.nome)}</span>`).join('')}</div>`;
}
function daySheet(d) {
  giornoAperto = d;
  const bl = [...(S.fatti ?? []).map((b, i) => ({ ...b, fatto: true, storico: i })), ...(S.piano?.blocchi ?? [])].filter(b => b.giorno === d);
  const ex = S.esami.filter(e => !e.esito && appelloScelto(e)?.data === d);
  sheet.innerHTML = `<div class="sheet-head"><h2>${esc(longDate(d))}</h2><button class="icon" data-close>✕</button></div>
    ${ex.map(e => `<div class="alert" style="border-color:${e.colore}"><span>🎓 <b>Esame: ${esc(e.nome)}</b> alle ${appelloScelto(e).ora}</span></div>`).join('')}
    ${bl.length ? `<div class="tasks">${bl.map(b => taskHtml(b, d > oggi)).join('')}</div>` : '<p class="empty">Niente in programma.</p>'}
    ${d > oggi ? '<p class="note">Si possono spuntare solo i giorni di oggi e passati.</p>' : ''}`;
  if (!sheet.open) sheet.showModal();
}

// ---------------------------------------------------------------- Altro
function pageAltro() {
  const imp = S.impostazioni;
  view.innerHTML = `<header class="top"><span class="brand">🎓</span><h1>Altro</h1></header>
    <h2>Ritmo di studio</h2>
    <div class="card">
      <div class="field"><span>Metodo</span><div class="seg"><button class="${imp.unoAllaVolta !== false ? 'on' : ''}" data-metodo="seq">Un esame alla volta</button><button class="${imp.unoAllaVolta === false ? 'on' : ''}" data-metodo="misto">Più esami insieme</button></div></div>
      <p class="note">${imp.unoAllaVolta !== false ? 'Per ogni esame: prima tutte le videolezioni, poi ripasso e quiz alternati a gruppi di lezioni con un ritmo regolare fino all\'esame, poi due simulazioni; negli ultimi giorni solo ripasso generale. Il successivo parte quando il primo è finito, o insieme solo se altrimenti non ci staresti dentro.' : 'Più esami in parallelo, il più vicino ha la precedenza, con ripassi dopo 1, 3, 7 e 14 giorni.'}</p>
      <div class="field"><span>Ore di studio al giorno</span><div class="stepper"><button class="icon" data-imp="oreGiorno|-0.5">−</button><b>${ore(imp.oreGiorno)}</b><button class="icon" data-imp="oreGiorno|0.5">+</button></div></div>
      <div class="field"><span>Giorni di studio</span><div class="days">${GIORNI_BREVI.map((g, i) => `<button class="${imp.giorni.includes(i) ? 'on' : ''}" data-wday="${i}">${g}</button>`).join('')}</div></div>
      <div class="field"><span>Giorni di solo ripasso prima di ogni esame</span><div class="stepper"><button class="icon" data-imp="giorniRipasso|-1">−</button><b>${imp.giorniRipasso}</b><button class="icon" data-imp="giorniRipasso|1">+</button></div></div>
      <p class="note">${ore(imp.oreGiorno * imp.giorni.length)} a settimana. Servono ${ore(S.esami.filter(e => !e.esito && appelloScelto(e)).reduce((a, e) => a + oreTotali(e), 0))} in tutto per gli esami in programma.</p>
    </div>
    <h2>Pause <small>vacanze, feste, impegni</small></h2>
    <div class="list">${(imp.pause ?? []).map(p => `<div class="row"><span><b>${esc(p.nome || 'Pausa')}</b><small>dal ${ddmmyyyy(p.da)} al ${ddmmyyyy(p.a)} · ${p.fattore ? `a ${Math.round(p.fattore * 100)}%` : 'niente studio'}</small></span><button class="x" data-delpause="${p.id}">×</button></div>`).join('') || '<p class="note">Nessuna pausa.</p>'}</div>
    <div class="card">
      <label class="field"><span>Nome</span><input id="pNome" placeholder="es. Vacanze di Natale"></label>
      <div class="inline"><label class="field"><span>Dal</span><input type="date" id="pDa"></label><label class="field"><span>Al</span><input type="date" id="pA"></label></div>
      <label class="field"><span>Ritmo</span><select id="pFatt"><option value="0">Niente studio</option><option value="0.5">Metà ore</option><option value="0.25">Un quarto</option></select></label>
      <button class="secondary wide" data-addpause>Aggiungi la pausa</button>
    </div>
    <h2>Dati della Pegaso</h2>
    <p class="note">${S.pegaso ? `Caricati il ${ddmmyyyy(S.pegaso.letto)}: videolezioni di ${Object.keys(S.pegaso.lezioni ?? {}).length} corsi, voti e frequenza.` : 'Carica il file con le videolezioni dei tuoi corsi, i voti e la frequenza: il piano diventa lezione per lezione.'} Il file resta solo su questo telefono.</p>
    <button class="secondary wide" data-pegasofile>📂 Carica il file dei dati Pegaso</button>
    <input type="file" id="pegasoFile" accept=".json,application/json,text/plain" hidden>
    <h2>Importa esami</h2>
    <p class="note">Copia gli appelli dal portale, incollali in Claude insieme alle istruzioni (pulsante qui sotto) e incolla qui il risultato. Gli esami già presenti si aggiornano senza perdere argomenti e voti.</p>
    <button class="secondary wide" data-copy="esami">📋 Copia istruzioni per Claude</button>
    <label class="field"><span>Testo da importare</span><textarea id="importText" placeholder='{ "formato": "ga-studio-esami-v1", "esami": [ … ] }'></textarea></label>
    <button class="secondary wide" data-readimport>Leggi</button>
    <h2>Calendario e backup</h2>
    <div class="list">
      <button class="row" data-ics><span><b>📅 Esporta in Google Calendar (.ics)</b><small>esami scelti e scadenze delle prenotazioni</small></span></button>
      <button class="row" data-backup><span><b>💾 Salva un backup</b><small>file JSON con tutto: esami, argomenti, voti, piano</small></span></button>
      <button class="row" data-restore><span><b>♻️ Ripristina un backup</b><small>sostituisce i dati di questo telefono</small></span></button>
    </div>
    <input type="file" id="restoreFile" accept=".json,application/json,text/plain" hidden>
    <h2>App</h2>
    ${updateBanner()}<p class="note">GAUNI ${esc(APP_VERSION)}${native ? ` · app Android ${esc(apkVersion())}` : ''}. I dati restano solo su questo telefono: fai un backup ogni tanto.
      Su iPhone: apri la pagina in Safari → Condividi → "Aggiungi alla schermata Home". Su Android: menu di Chrome → "Installa app".</p>
    <button class="link danger" data-reset>Ricomincia da capo</button>`;
}
/** Dati personali dalla piattaforma Pegaso (voti, frequenza, lezioni viste): incollati in Altro o aperti da un link. */
function importaPersonale(testo) {
  let dati;
  try { dati = JSON.parse(testo.slice(testo.indexOf('{'), testo.lastIndexOf('}') + 1)); } catch { toast('Il testo non è valido.'); return; }
  const r = importaPegaso(S, dati, oggi);
  applicaProposta(S, oggi);
  if (sheet.open) sheet.close();
  const sc = Object.values(dati.schede ?? {}).reduce((a, x) => a + Object.keys(x).length, 0);
  aggiorna(sc ? `Schede di ripasso caricate: ${sc} lezioni. Le trovi nei blocchi di ripasso e quiz.` : `Dati Pegaso caricati: ${r.esiti} esami superati e l'avanzamento di ${r.corsi} corsi.`);
}
function importPreview() {
  const { esami, errori } = anteprima;
  sheet.innerHTML = `<div class="sheet-head"><h2>Anteprima import</h2><button class="icon" data-close>✕</button></div>
    ${errori.length ? `<div class="alerts">${errori.map(t => `<div class="alert arancio"><span>⚠️ ${esc(t)}</span></div>`).join('')}</div>` : ''}
    <p class="note">${esami.length} esami, ${esami.reduce((a, e) => a + e.appelli.length, 0)} appelli:</p>
    <div class="list">${esami.map(e => `<div class="row"><span><b>${esc(e.nome)}</b><small>${e.cfu} CFU · ${e.appelli.map(a => shortDate(a.data)).join(', ')}</small></span></div>`).join('')}</div>
    ${esami.length ? '<button class="primary" data-doimport>Importa</button>' : ''}`;
  if (!sheet.open) sheet.showModal();
}

// ---------------------------------------------------------------- navigazione
/** Blocco del piano aperto nel ripasso guidato (#/studia/<id>), se c'è. */
function bloccoStudio() {
  const [page, id] = location.hash.replace(/^#\/?/, '').split('/');
  if (page !== 'studia' || !id) return null;
  let k = '';
  try { k = decodeURIComponent(id); } catch { return null; }
  const b = S.piano?.blocchi?.find(x => x.id === k);
  return b && esame(b.esameId) ? b : null;
}
function render() {
  oggi = today();
  const h = location.hash.replace(/^#\/?/, '');
  const [page, id] = h.split('/');
  if (page === 'importa' && id) {   // link con i dati personali (restano nel telefono: la parte dopo # non va su internet)
    history.replaceState(null, '', location.pathname);
    let testo = '';
    try { testo = new TextDecoder().decode(Uint8Array.from(atob(id.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))); } catch { /* link rovinato */ }
    if (testo && confirm('Caricare in GAUNI i tuoi dati della Pegaso (voti, frequenza, lezioni viste)?')) importaPersonale(testo);
    else render();
    return;
  }
  const tab = page === 'esame' ? 'esami' : page === 'studia' ? 'oggi' : page || 'oggi';
  for (const a of document.querySelectorAll('#nav a')) a.classList.toggle('on', a.dataset.tab === tab);
  fermaStudio();
  const studio = bloccoStudio();
  if (page === 'studia' && studio) pageStudia(view, S, esame(studio.esameId), studio);
  else if (page === 'esami') pageEsami();
  else if (page === 'esame') pageEsame(id);
  else if (page === 'calendario') pageCalendario();
  else if (page === 'altro') pageAltro();
  else pageOggi();
}
addEventListener('hashchange', () => { render(); scrollTo(0, 0); });

function scarica(nome, testo, tipo) {
  if (native?.shareFile) { if (!native.shareFile(nome, tipo, testo)) toast('Salvataggio non riuscito'); return; }
  const url = URL.createObjectURL(new Blob([testo], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
async function copia(testo) {
  if (native?.copyText?.(testo)) { toast('Copiato! Incollalo in Claude e aggiungi sotto il testo.'); return; }
  try { await navigator.clipboard.writeText(testo); toast('Copiato! Incollalo in Claude e aggiungi sotto il testo.'); }
  catch { sheet.innerHTML = `<div class="sheet-head"><h2>Copia questo testo</h2><button class="icon" data-close>✕</button></div><textarea readonly style="min-height:300px">${esc(testo)}</textarea>`; sheet.showModal(); }
}

// ---------------------------------------------------------------- aggiornamenti dell'APK
// Il contenuto dell'app si aggiorna da solo da GitHub Pages; l'APK (il guscio) solo con una nuova release.
const RELEASES = 'https://api.github.com/repos/Gavao/ga-uni/releases/latest';
let apkUpdate = null;
const apkVersion = () => native?.appVersion?.() ?? '';
const newer = (a, b) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
};
async function checkApkUpdate() {
  if (!native) return;
  try {
    const rel = await (await fetch(RELEASES)).json();
    const version = rel.tag_name?.replace(/^v/, '');
    const asset = rel.assets?.find(a => a.name.endsWith('.apk'));
    apkUpdate = version && asset && newer(version, apkVersion()) ? { version, url: asset.browser_download_url } : null;
  } catch { /* offline */ }
}
const updateBanner = () => (apkUpdate ? `<button class="secondary wide" data-update>⬆️ È disponibile la versione ${esc(apkUpdate.version)} dell'app: tocca per aggiornare</button>` : '');

/** Tasto Indietro di Android: chiude la finestra aperta o torna indietro di una pagina. */
window.appBack = () => {
  if (sheet.open) { sheet.close(); return true; }
  if (location.hash && location.hash !== '#/') { history.back(); return true; }
  return false;
};

// ---------------------------------------------------------------- tocchi
document.addEventListener('click', async e => {
  const t = e.target;
  const on = sel => t.closest(sel);
  if (on('[data-close]')) { sheet.close(); return; }
  if (on('[data-update]')) { native.installUpdate(apkUpdate.url); toast('Download in corso: al termine si apre l\'installazione.'); return; }
  let el;
  const studio = bloccoStudio();
  if (studio && clickStudia(t, view, S, esame(studio.esameId), studio, () => {
    if (!studio.fatto) segnaFatto(S, studio, true, oggi);
    salva(S);
    navigator.vibrate?.(30);
    toast('Segnato come fatto 👍');
    location.hash = '#/';
  })) return;
  if ((el = on('[data-task]'))) {
    const k = el.dataset.task;
    if (k.startsWith('s')) {   // tolto dallo storico (era già fatto)
      const [b] = S.fatti.splice(+k.slice(1), 1);
      segnaFatto(S, b, false, oggi);
    } else {
      const b = S.piano.blocchi.find(x => x.id === k.slice(1));
      if (!b) return;
      segnaFatto(S, b, !b.fatto, oggi);
      if (b.fatto) navigator.vibrate?.(30);
    }
    salva(S);
    if (sheet.open && giornoAperto) daySheet(giornoAperto);
    render();
    return;
  }
  if ((el = on('[data-setore]'))) { S.impostazioni.oreGiorno = +el.dataset.setore; aggiorna(`Ora studi ${ore(+el.dataset.setore)} al giorno: piano rifatto.`); return; }
  if (on('[data-replan]')) { aggiorna('Piano rifatto da oggi: il lavoro rimasto è ridistribuito.'); return; }
  if ((el = on('[data-booked]'))) {
    const x = esame(el.dataset.booked), a = appelloScelto(x);
    if (a) { a.prenotato = true; x.scelta = a.id; x.sceltaManuale = true; }
    salva(S); toast(`Prenotato: ${x.nome} 👍`); render(); return;
  }
  if ((el = on('[data-pick]'))) {
    const [id, scelta] = el.dataset.pick.split('|');
    const x = esame(id);
    x.scelta = x.scelta === scelta && scelta === 'salta' ? null : scelta;
    x.sceltaManuale = true;
    if (x.scelta === null) { x.sceltaManuale = false; applicaProposta(S, oggi); }
    aggiorna(); return;
  }
  if ((el = on('[data-book]'))) {
    const [id, aid] = el.dataset.book.split('|');
    const x = esame(id), a = x.appelli.find(y => y.id === aid);
    a.prenotato = !a.prenotato;
    if (a.prenotato) { x.scelta = a.id; x.sceltaManuale = true; }
    aggiorna(a.prenotato ? 'Segnato come prenotato.' : null); return;
  }
  if ((el = on('[data-unpin]'))) { const x = esame(el.dataset.unpin); x.sceltaManuale = false; applicaProposta(S, oggi); aggiorna('L\'app sceglie di nuovo l\'appello migliore.'); return; }
  if (on('[data-propose]')) {
    const prima = Object.fromEntries(S.esami.map(x => [x.id, x.scelta]));
    applicaProposta(S, oggi);
    const cambiati = S.esami.filter(x => x.scelta !== prima[x.id]).length;
    aggiorna(cambiati ? `Proposta pronta: ${cambiati} appelli cambiati.` : 'Le scelte erano già le migliori 👍'); return;
  }
  if ((el = on('[data-pass]'))) {
    const x = esame(el.dataset.pass);
    x.esito = { voto: +$('#voto').value, lode: $('#lode').checked && +$('#voto').value === 30, data: appelloScelto(x)?.data ?? oggi };
    aggiorna(`🎉 Complimenti! ${x.nome}: ${x.esito.voto}${x.esito.lode ? ' e lode' : ''}`); return;
  }
  if ((el = on('[data-unpass]'))) { esame(el.dataset.unpass).esito = null; aggiorna(); return; }
  if ((el = on('[data-delexam]'))) {
    const x = esame(el.dataset.delexam);
    if (!confirm(`Eliminare ${x.nome}? Si perdono argomenti e voto.`)) return;
    S.esami = S.esami.filter(y => y !== x);
    S.fatti = S.fatti.filter(b => b.esameId !== x.id);
    location.hash = '#/esami';
    aggiorna('Esame eliminato.'); return;
  }
  if ((el = on('[data-addtopics]'))) {
    const x = esame(el.dataset.addtopics);
    const nuovi = leggiArgomenti($('#newTopics').value);
    if (!nuovi.length) return toast('Scrivi almeno un argomento.');
    x.argomenti.push(...nuovi);
    aggiorna(`${nuovi.length} argomenti aggiunti.`); return;
  }
  if ((el = on('[data-tdiff]'))) {
    const [id, tid] = el.dataset.tdiff.split('|');
    const x = esame(id), tp = /^L\d+$/.test(tid) ? x.lezioni.find(y => `L${y.n}` === tid) : x.argomenti.find(y => y.id === tid);
    tp.difficolta ??= 'medio';
    tp.difficolta = { facile: 'medio', medio: 'difficile', difficile: 'facile' }[tp.difficolta];
    aggiorna(); return;
  }
  if ((el = on('[data-tdone]'))) {
    const [id, tid] = el.dataset.tdone.split('|');
    const x = esame(id), tp = /^L\d+$/.test(tid) ? x.lezioni.find(y => `L${y.n}` === tid) : x.argomenti.find(y => y.id === tid);
    tp.fattoIl = tp.fattoIl ? null : oggi;
    aggiorna(tp.fattoIl ? `${/^L/.test(tid) ? 'Lezione fatta' : 'Argomento fatto'}: partono i ripassi.` : null); return;
  }
  if ((el = on('[data-tdel]'))) {
    const [id, tid] = el.dataset.tdel.split('|');
    const x = esame(id);
    x.argomenti = x.argomenti.filter(y => y.id !== tid);
    aggiorna(); return;
  }
  if ((el = on('[data-calmode]'))) { cal.modo = el.dataset.calmode; render(); return; }
  if ((el = on('[data-calmove]'))) {
    const n = +el.dataset.calmove;
    if (cal.modo === 'mese') { const [y, m] = cal.rif.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); cal.rif = d.toISOString().slice(0, 10); }
    else cal.rif = addDays(cal.rif, 7 * n);
    render(); return;
  }
  if (on('[data-caltoday]')) { cal.rif = oggi; render(); return; }
  if ((el = on('[data-day]'))) { daySheet(el.dataset.day); return; }
  if ((el = on('[data-imp]'))) {
    const [k, d] = el.dataset.imp.split('|');
    const lim = { oreGiorno: [0.5, 14], giorniRipasso: [1, 7] }[k];
    S.impostazioni[k] = Math.max(lim[0], Math.min(lim[1], S.impostazioni[k] + +d));
    aggiorna(); return;
  }
  if ((el = on('[data-metodo]'))) { S.impostazioni.unoAllaVolta = el.dataset.metodo === 'seq'; aggiorna('Metodo cambiato: piano rifatto.'); return; }
  if ((el = on('[data-wday]'))) {
    const i = +el.dataset.wday, g = S.impostazioni.giorni;
    S.impostazioni.giorni = g.includes(i) ? g.filter(x => x !== i) : [...g, i].sort();
    aggiorna(); return;
  }
  if (on('[data-addpause]')) {
    const da = $('#pDa').value, a = $('#pA').value;
    if (!da || !a || a < da) return toast('Scegli le date (la fine dopo l\'inizio).');
    S.impostazioni.pause.push({ id: uid(), nome: $('#pNome').value.trim(), da, a, fattore: +$('#pFatt').value });
    aggiorna('Pausa aggiunta: piano rifatto.'); return;
  }
  if ((el = on('[data-delpause]'))) { S.impostazioni.pause = S.impostazioni.pause.filter(p => p.id !== el.dataset.delpause); aggiorna(); return; }
  if ((el = on('[data-copy]'))) { copia(el.dataset.copy === 'argomenti' ? ISTRUZIONI_ARGOMENTI : ISTRUZIONI_CLAUDE); return; }
  if (on('[data-readimport]')) {
    const testo = $('#importText').value;
    if (/gauni-pegaso-v1/.test(testo)) { importaPersonale(testo); return; }
    anteprima = leggiImport(testo);
    importPreview(); return;
  }
  if (on('[data-doimport]')) {
    const r = unisci(S, anteprima.esami);
    for (const x of S.esami) x.colore ??= COLORI[0];
    applicaProposta(S, oggi);
    sheet.close();
    anteprima = null;
    aggiorna(`Import fatto: ${r.aggiunti} esami nuovi, ${r.aggiornati} aggiornati.`); return;
  }
  if (on('[data-ics]')) {
    if (native?.openFile) { native.openFile('esami-gauni.ics', 'text/calendar', creaIcs(S)); return; }
    scarica('esami-gauni.ics', creaIcs(S), 'text/calendar'); toast('File .ics scaricato: aprilo per aggiungere gli eventi al calendario.'); return;
  }
  if (on('[data-backup]')) { scarica(`gauni-backup-${oggi}.json`, backup(S), 'application/json'); if (!native) toast('Backup salvato nei download.'); return; }
  if (on('[data-restore]')) { $('#restoreFile').click(); return; }
  if (on('[data-pegasofile]')) { $('#pegasoFile').click(); return; }
  if (on('[data-reset]')) {
    if (!confirm('Ricominciare da capo? Si perdono argomenti, voti e piano (fai prima un backup).')) return;
    S = statoIniziale(); applicaProposta(S, oggi); aggiorna('Ripartito con gli esami di partenza.'); return;
  }
});

document.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset.ecfg) {
    const [k, id] = el.dataset.ecfg.split('|');
    const x = esame(id);
    const lim = { oreCfu: [5, 40], giaStudiato: [0, 90], oreLezione: [0.5, 6] }[k] ?? [0, 90];
    x[k] = Math.max(lim[0], Math.min(lim[1], +el.value || 0));
    aggiorna(); return;
  }
  if (el.id === 'pegasoFile' && el.files[0]) { importaPersonale(await el.files[0].text()); el.value = ''; return; }
  if (el.id === 'restoreFile' && el.files[0]) {
    try {
      const nuovo = ripristina(await el.files[0].text());
      if (!confirm(`Ripristinare il backup? Sostituisce i dati di questo telefono (${nuovo.esami.length} esami).`)) return;
      S = nuovo;
      aggiorna('Backup ripristinato.');
    } catch (err) { toast(err.message); }
    el.value = '';
  }
});

// ---------------------------------------------------------------- avvio e aggiornamenti
async function checkWebUpdate() {
  if (APP_VERSION === 'dev' || sheet.open) return;
  try {
    const latest = (await (await fetch('version.txt', { cache: 'no-store' })).text()).trim();
    if (!latest || latest === APP_VERSION || sessionStorage.getItem('reloadedFor') === latest) return;
    sessionStorage.setItem('reloadedFor', latest);
    location.reload();
  } catch { /* offline */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (today() !== oggi) render();   // è passata la mezzanotte
  checkWebUpdate();
});
render();
checkApkUpdate().then(() => { if (apkUpdate) render(); });
checkWebUpdate();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
if (location.hostname === 'localhost') window.__u = { get S() { return S; }, render };
