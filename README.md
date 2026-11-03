# GAUNI

Esami universitari e piano di studio, dal telefono: scelta degli appelli, prenotazioni, piano giorno per giorno
con ripassi e simulazioni, calendario, voti e media.

- **Dati solo sul telefono** (localStorage del browser), con backup in JSON da Altro.
- **Installabile**: su Android menu di Chrome → "Installa app"; su iPhone Safari → Condividi → "Aggiungi alla schermata Home".
  Funziona anche senza rete e si aggiorna da sola quando esce una versione nuova.
- **App**: https://gavao.github.io/ga-uni/

## Come funziona
- **Import**: in Altro → "Copia istruzioni per Claude", incolla in Claude insieme al testo copiato dal portale esami,
  poi incolla il JSON che ti restituisce in "Testo da importare". Gli esami già presenti si aggiornano senza perdere niente.
- **Appelli**: "Proponi gli appelli migliori" evita due esami lo stesso giorno, distanzia gli esami vicini e lascia
  abbastanza ore di studio. Le scelte fatte a mano (📌) restano.
- **Piano** (`js/pianifica.js`): ore per esame = CFU × ore per CFU (25) − la parte già studiata, divise in studio (60%,
  più tempo agli argomenti difficili), ripassi a 1-3-7-14 giorni (15%), simulazioni d'esame (10%) e ripasso finale
  negli ultimi giorni (15%). Ogni giorno le ore disponibili (ore al giorno, giorni scelti, pause) vanno prima all'esame
  più vicino, al ritmo che serve a ciascuno per finire in tempo. "Ripianifica" ridistribuisce il lavoro saltato.

## Comandi
- Prova in locale: `powershell -ExecutionPolicy Bypass -File serve.ps1` → http://localhost:8103
- Prove automatiche: http://localhost:8103/tests.html (import, scelta degli appelli, piano, avvisi, .ics)
- Pubblica: `powershell -ExecutionPolicy Bypass -File tools\publish.ps1 "Descrizione"`

Nessuna build: HTML, CSS e JavaScript (moduli ES) così come sono. Per pubblicarla altrove basta copiare la cartella
su qualsiasi hosting statico (GitHub Pages, Netlify, Vercel).
