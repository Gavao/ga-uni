// Esami di partenza (A.A. 2026/2027, Salerno), presi dal portale: si caricano al primo avvio.
const A = (data, ora, aperturaPren, chiusuraPren) => ({ data, ora, aperturaPren, chiusuraPren, tipo: 'Prova intermedia 26/27', modalita: 'Scritto online' });

export const SEED = {
  formato: 'ga-studio-esami-v1',
  annoAccademico: '2026/2027',
  esami: [
    { nome: 'User experience', codice: '0312506INGINF05IINM', cfu: 6, appelli: [
      A('2026-11-05', '09:30', '2026-10-16', '2026-11-03'), A('2026-11-06', '09:30', '2026-10-17', '2026-11-04')] },
    { nome: 'Fondamenti di intelligenza artificiale', codice: '0312509INF01IINM', cfu: 9, appelli: [
      A('2026-11-30', '09:30', '2026-11-10', '2026-11-28'), A('2026-12-03', '09:30', '2026-11-13', '2026-12-01'), A('2026-12-04', '09:30', '2026-11-14', '2026-12-02')] },
    { nome: 'Tecnologie digitali e cybersicurezza', codice: '0312506IUS20INM', cfu: 6, appelli: [
      A('2027-02-08', '09:30', '2027-01-19', '2027-02-06'), A('2027-02-11', '09:30', '2027-01-22', '2027-02-09'), A('2027-02-12', '09:30', '2027-01-23', '2027-02-10')] },
    { nome: 'Calcolo delle probabilità e statistica', codice: '0312506MAT06NM', cfu: 6, appelli: [
      A('2027-03-08', '09:30', '2027-02-16', '2027-03-06'), A('2027-03-11', '09:30', '2027-02-19', '2027-03-09'), A('2027-03-12', '09:30', '2027-02-20', '2027-03-10')] },
    { nome: 'Sicurezza informatica', codice: '0312509INF01IIINM', cfu: 9, appelli: [
      A('2027-03-08', '09:30', '2027-02-16', '2027-03-06'), A('2027-03-11', '09:30', '2027-02-19', '2027-03-09'), A('2027-03-12', '09:30', '2027-02-20', '2027-03-10')] },
    { nome: 'Algoritmi e strutture dati', codice: '0312509INF01NM', cfu: 9, appelli: [
      A('2027-05-17', '09:30', '2027-04-27', '2027-05-15'), A('2027-05-20', '09:30', '2027-04-30', '2027-05-18'), A('2027-05-21', '09:30', '2027-05-01', '2027-05-19')] },
    { nome: 'Tecnologie Web', codice: '0312512INF01IINM', cfu: 12, appelli: [
      A('2027-08-23', '09:30', '2027-08-03', '2027-08-21'), A('2027-08-26', '09:30', '2027-08-06', '2027-08-24'), A('2027-08-27', '09:30', '2027-08-07', '2027-08-25')] },
    { nome: 'Reti di calcolatori e cybersecurity', codice: '0312512INF01INM', cfu: 12, appelli: [
      A('2027-08-23', '09:30', '2027-08-03', '2027-08-21'), A('2027-08-26', '09:30', '2027-08-06', '2027-08-24'), A('2027-08-27', '09:30', '2027-08-07', '2027-08-25')] },
    { nome: 'Architettura dei calcolatori', codice: '0312509INF01INM', cfu: 9, appelli: [
      A('2027-09-13', '09:30', '2027-08-24', '2027-09-11'), A('2027-09-16', '09:30', '2027-08-27', '2027-09-14'), A('2027-09-17', '09:30', '2027-08-28', '2027-09-15')] },
    { nome: 'Algebra', codice: '0312606MAT02NM', cfu: 6, appelli: [
      A('2027-09-20', '09:30', '2027-08-31', '2027-09-18'), A('2027-09-23', '09:30', '2027-09-03', '2027-09-21'), A('2027-09-24', '09:30', '2027-09-04', '2027-09-22')] },
  ],
};
