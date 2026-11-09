// Import degli esami: invece di leggere il testo del portale (che cambia formato), l'app riceve un testo JSON
// già ordinato. Lo prepara Claude a partire da quello che si copia dal portale: le istruzioni da dargli sono
// in ISTRUZIONI_CLAUDE (pulsante "Copia istruzioni per Claude").
import { isValid } from './date.js';
import { espandi } from './pegaso.js';

export const FORMATO = 'ga-studio-esami-v1';
export const COLORI = ['#f472b6', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#fb923c', '#22d3ee', '#f87171', '#a3e635', '#e879f9', '#2dd4bf', '#facc15'];
export const uid = () => Math.random().toString(36).slice(2, 10);
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();

/**
 * Legge il testo incollato: restituisce { esami: [...], errori: [...] }. Accetta anche il JSON dentro a un
 * blocco ```json … ``` o con testo intorno (come lo scrive Claude). Gli appelli dello stesso esame (stesso
 * codice o stesso nome) finiscono insieme; quelli doppi (stessa data) si contano una volta.
 */
export function leggiImport(testo) {
  const errori = [];
  let dati;
  const s = String(testo ?? '');
  const inizio = s.indexOf('{'), fine = s.lastIndexOf('}');
  if (inizio < 0 || fine < inizio) return { esami: [], errori: ['Non trovo il blocco di dati: deve iniziare con { e finire con }.'] };
  try { dati = JSON.parse(s.slice(inizio, fine + 1)); } catch (e) { return { esami: [], errori: [`Il testo non è un JSON valido (${e.message}).`] }; }
  const lista = Array.isArray(dati) ? dati : dati.esami;
  if (!Array.isArray(lista)) return { esami: [], errori: ['Manca l\'elenco "esami".'] };
  const per = new Map();
  lista.forEach((e, i) => {
    const nome = String(e.nome ?? '').trim();
    if (!nome) { errori.push(`Esame n. ${i + 1}: manca il nome.`); return; }
    const cfu = Number(e.cfu);
    if (!(cfu > 0)) errori.push(`${nome}: CFU mancanti o non validi (uso 6).`);
    const key = e.codice ? `c:${String(e.codice).trim().toUpperCase()}` : `n:${norm(nome)}`;
    const es = per.get(key) ?? { nome: nome.replace(/\s*\(\d+\s*cfu\)\s*$/i, ''), codice: e.codice ? String(e.codice).trim() : '', cfu: cfu > 0 ? cfu : 6, appelli: [] };
    per.set(key, es);
    for (const [j, a] of (e.appelli ?? []).entries()) {
      if (!isValid(a.data)) { errori.push(`${nome}, appello ${j + 1}: data "${a.data}" non valida (serve AAAA-MM-GG).`); continue; }
      if (es.appelli.some(x => x.data === a.data)) continue;
      es.appelli.push({
        data: a.data,
        ora: /^\d{1,2}:\d{2}$/.test(a.ora ?? '') ? a.ora.padStart(5, '0') : '09:00',
        aperturaPren: isValid(a.aperturaPren) ? a.aperturaPren : null,
        chiusuraPren: isValid(a.chiusuraPren) ? a.chiusuraPren : null,
        tipo: String(a.tipo ?? dati.tipo ?? '').trim(),
        modalita: String(a.modalita ?? '').trim(),
      });
    }
  });
  const esami = [...per.values()].filter(e => {
    if (!e.appelli.length) errori.push(`${e.nome}: nessun appello valido.`);
    return e.appelli.length > 0;
  });
  for (const e of esami) e.appelli.sort((a, b) => a.data.localeCompare(b.data));
  return { esami, errori };
}

/** Esame nuovo con i valori di partenza. */
export function nuovoEsame(e, colore) {
  return {
    id: uid(), nome: e.nome, codice: e.codice ?? '', cfu: e.cfu, colore,
    appelli: e.appelli.map(a => ({ id: uid(), prenotato: false, ...a })),
    scelta: null, sceltaManuale: false, oreCfu: 25, giaStudiato: 0, argomenti: [], esito: null,
  };
}

/**
 * Unisce gli esami importati a quelli che ci sono già: stesso codice (o stesso nome) = stesso esame, si
 * aggiornano CFU e appelli (tenendo prenotazioni e scelta), argomenti, voti e piano restano.
 * Restituisce { aggiunti, aggiornati }.
 */
export function unisci(state, importati) {
  let aggiunti = 0, aggiornati = 0;
  for (const e of importati) {
    const cur = state.esami.find(x => (e.codice && x.codice && x.codice.toUpperCase() === e.codice.toUpperCase()) || norm(x.nome) === norm(e.nome));
    if (!cur) {
      state.esami.push(nuovoEsame(e, COLORI[state.esami.length % COLORI.length]));
      aggiunti++;
      continue;
    }
    cur.cfu = e.cfu;
    if (e.codice) cur.codice = e.codice;
    for (const a of e.appelli) {
      const old = cur.appelli.find(x => x.data === a.data);
      if (old) Object.assign(old, a, { id: old.id, prenotato: old.prenotato });
      else cur.appelli.push({ id: uid(), prenotato: false, ...a });
    }
    cur.appelli.sort((a, b) => a.data.localeCompare(b.data));
    aggiornati++;
  }
  return { aggiunti, aggiornati };
}

/** Argomenti incollati (uno per riga, anche numerati o con trattini). "(difficile)" o "!!" alla fine = difficile. */
export function leggiArgomenti(testo) {
  return String(testo ?? '').split('\n').map(r => r.replace(/^\s*(?:[-*•–]|\d+[.)]|[a-z][.)])\s*/i, '').trim()).filter(Boolean).map(r => {
    let difficolta = 'medio';
    const m = r.match(/\s*[([]\s*(facile|medio|media|difficile)\s*[)\]]\s*$/i);
    if (m) { difficolta = m[1].toLowerCase().startsWith('med') ? 'medio' : m[1].toLowerCase(); r = r.slice(0, m.index); }
    else if (/!!\s*$/.test(r)) { difficolta = 'difficile'; r = r.replace(/\s*!!\s*$/, ''); }
    return { id: uid(), titolo: r.trim(), difficolta, fattoIl: null };
  });
}

export const ISTRUZIONI_CLAUDE = `Ti incollo sotto il testo copiato dal portale esami della mia università. Trasformalo in un blocco JSON
da importare nella mia app GAUNI, con esattamente questo formato (solo il JSON, senza commenti):

{
  "formato": "${FORMATO}",
  "annoAccademico": "2026/2027",
  "esami": [
    { "nome": "Nome del corso", "codice": "CODICE", "cfu": 6, "appelli": [
      { "data": "AAAA-MM-GG", "ora": "HH:MM", "aperturaPren": "AAAA-MM-GG", "chiusuraPren": "AAAA-MM-GG",
        "tipo": "es. Prova intermedia 26/27", "modalita": "es. Scritto online" } ] }
  ]
}

Regole:
- Un solo oggetto per esame: gli appelli dello stesso esame (stesso codice) vanno tutti nella sua lista "appelli".
- Date sempre AAAA-MM-GG. Se l'anno di un appello manca, deducilo dall'anno accademico (da settembre a dicembre il primo anno, da gennaio ad agosto il secondo).
- "aperturaPren" e "chiusuraPren" sono "Data inizio di prenotazione" e "Data fine di prenotazione".
- Togli dal nome cose come "(12 cfu)". Non inventare dati: se un campo manca, lascialo vuoto ("").
- Alla fine, fuori dal JSON, segnalami in una riga esami con appelli nello stesso giorno o prenotazioni in scadenza.

Testo del portale:
`;

export const ISTRUZIONI_ARGOMENTI = `Ti incollo il programma di un corso universitario. Fammi l'elenco degli argomenti da studiare, uno per riga,
in ordine di studio, con alla fine tra parentesi la difficoltà stimata: (facile), (medio) o (difficile).
Raggruppa i dettagli piccoli: al massimo 15-20 righe. Solo l'elenco, senza altro testo.

Programma:
`;

// ---------------------------------------------------------------- Pegaso
/**
 * Aggiunge agli esami l'elenco delle videolezioni (per codice) e gli altri esami del piano di studi, presi dai
 * dati importati (state.pegaso). Si può rifare quante volte si vuole: non tocca quello che c'è già.
 */
export function arricchisciPegaso(state) {
  const cat = state.pegaso;
  if (!cat) return;
  for (const e of state.esami) {
    const titoli = cat.lezioni?.[e.codice?.toUpperCase()];
    if (!titoli || e.lezioni?.length) continue;
    e.lezioni = titoli.map((titolo, i) => ({ n: i + 1, titolo, visto: 0, fattoIl: null }));
    e.oreLezione ??= cat.oreLezione ?? 1.5;
  }
  for (const [nome, cfu, anno] of cat.altri ?? []) {
    if (state.esami.some(x => norm(x.nome) === norm(nome))) continue;
    state.esami.push({ ...nuovoEsame({ nome, cfu, appelli: [] }, COLORI[state.esami.length % COLORI.length]), anno });
  }
}

/**
 * Dati presi dalla piattaforma (formato "gauni-pegaso-v1", file privato): elenco delle videolezioni per
 * insegnamento, altri esami del piano, esami già sostenuti con il voto, frequenza ufficiale (% insegnamento)
 * e quanto di ogni lezione è già stato visto ("100x5,40x15,20"). Restituisce un riepilogo { esiti, corsi }.
 */
export function importaPegaso(state, dati, oggi) {
  let esiti = 0, corsi = 0;
  state.pegaso = {
    lezioni: dati.lezioni ?? state.pegaso?.lezioni ?? {},
    altri: dati.altri ?? state.pegaso?.altri ?? [],
    oreLezione: dati.oreLezione ?? state.pegaso?.oreLezione,
    letto: dati.letto ?? oggi,
    schede: state.pegaso?.schede ?? {},
  };
  // Schede di ripasso (concetti chiave, domande, quiz) per lezione: si aggiungono a quelle già caricate
  for (const [cod, lez] of Object.entries(dati.schede ?? {})) {
    const k = cod.toUpperCase();
    state.pegaso.schede[k] = { ...state.pegaso.schede[k], ...lez };
  }
  for (const x of dati.esiti ?? []) {
    let e = state.esami.find(y => norm(y.nome) === norm(x.nome));
    if (!e) { e = { ...nuovoEsame({ nome: x.nome, cfu: x.cfu, appelli: [] }, COLORI[state.esami.length % COLORI.length]), anno: x.anno }; state.esami.push(e); }
    e.esito = { voto: Number(x.voto), lode: !!x.lode, data: x.data ?? null };
    esiti++;
  }
  arricchisciPegaso(state);
  for (const e of state.esami) {
    const cod = e.codice?.toUpperCase();
    if (dati.frequenza?.[cod] != null) e.frequenza = Number(dati.frequenza[cod]);
    const viste = dati.viste?.[cod];
    if (!viste || !e.lezioni) continue;
    espandi(viste).forEach((v, i) => {
      const l = e.lezioni[i];
      if (!l) return;
      l.visto = Math.max(l.visto ?? 0, v);
      if (l.visto >= 100) l.fattoIl ??= oggi;
    });
    corsi++;
  }
  return { esiti, corsi };
}
