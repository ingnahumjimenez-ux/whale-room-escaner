// =====================================================================
//  Escáner Bolsa · universo "BingX 24/7"
//  Descarga de la API pública de BingX (sin clave) la lista de acciones con
//  futuros perpetuos que se operan 24/7 y sus velas de 15m, y las deja en el
//  mismo formato que la descarga de Yahoo para que bolsa_analizar.mjs las analice.
// =====================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const API = 'https://open-api.bingx.com';
const SALIDA = process.env.CRUDO || '/tmp/bolsa24_crudo.json';
const VELAS = 1000, MIN_HORAS_SEMANA = 100;   // 24/7 = más de 100 h de sesión regular en la semana (la bolsa tiene ~33 h)
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), '|', ...a);
const espera = ms => new Promise(r => setTimeout(r, ms));

async function api(ruta, q = {}, intentos = 3) {
  const url = API + ruta + (Object.keys(q).length ? '?' + new URLSearchParams(q) : '');
  for (let n = 1; n <= intentos; n++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'escaner-bolsa' } });
      const j = await r.json();
      if (j && (j.code === 0 || j.code === '0')) return j.data;
      throw new Error(`código ${j && j.code} ${j && j.msg}`);
    } catch (e) { if (n === intentos) throw e; await espera(1500 * n); }
  }
}
const ticker = sym => { const m = String(sym).match(/^NCSK([A-Z0-9.]+?)2USD-USDT$/); return m ? m[1] : null; };

function nombres() {   // nombre y sector desde la lista del S&P 500 (si la acción está ahí)
  const out = {};
  try {
    const txt = fs.readFileSync(path.join(AQUI, 'bolsa_lista.csv'), 'utf8').split(/\r?\n/);
    const cab = txt[0].split(',');
    const iS = cab.indexOf('Symbol'), iN = cab.indexOf('Security'), iG = cab.indexOf('GICS Sector');
    const ES = { 'Information Technology': 'Tecnología', 'Communication Services': 'Comunicaciones', 'Consumer Discretionary': 'Consumo', 'Consumer Staples': 'Consumo básico', 'Health Care': 'Salud', 'Financials': 'Finanzas', 'Industrials': 'Industria', 'Energy': 'Energía', 'Utilities': 'Servicios públicos', 'Real Estate': 'Inmobiliario', 'Materials': 'Materiales' };
    for (const l of txt.slice(1)) {
      const c = l.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map(x => x.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')) || [];
      if (c[iS]) out[c[iS].replace('.', '')] = { n: c[iN], sec: ES[c[iG]] || c[iG] };
    }
  } catch (e) {}
  return out;
}

async function main() {
  // 1) acciones con horario de trading (solo contratos TradFi de tipo acción)
  const horario = await api('/openApi/swap/v1/quote/tradingSchedule');
  const acciones = (horario || []).filter(x => x.contractType === 'nonCryptoStock' && x.marketStatus !== 'pause');
  const es247 = x => {
    const h = (x.sessions || []).filter(s => s.type === 'REGULAR').reduce((a, s) => a + (s.endTime - s.startTime), 0) / 36e5;
    return h >= MIN_HORAS_SEMANA;
  };
  const lista = acciones.filter(es247);
  log(`BingX: ${acciones.length} contratos de acciones, ${lista.length} con trading 24/7.`);
  if (lista.length < 5) { log('Muy pocas acciones 24/7; no se actualiza.'); process.exit(1); }
  // 2) apalancamiento máximo y nombre del activo
  const info = {};
  try { for (const c of await api('/openApi/swap/v2/quote/contracts')) info[c.symbol] = c; } catch (e) { log('Sin datos de contratos (se continúa):', e.message); }
  const NOM = nombres();
  // 3) velas de 15m (precio mark: límite 500 consultas cada 10 s)
  const D = {}, lev = {};
  let i = 0;
  for (const x of lista) {
    i++;
    const tk = ticker(x.symbol) || (info[x.symbol] && info[x.symbol].asset) || x.symbol;
    try {
      const K = await api('/openApi/swap/v1/market/markPriceKlines', { symbol: x.symbol, interval: '15m', limit: VELAS + 1 });
      const v = (K || []).map(k => ({ t: +(k.openTime ?? k.time), o: +k.open, h: +k.high, l: +k.low, c: +k.close, v: +(k.volume || 0) }))
        .filter(k => k.t && isFinite(k.c)).sort((a, b) => a.t - b.t);
      if (v.length < 300) continue;
      v.pop();   // sin la vela en curso
      const nm = NOM[tk] || {};
      D[tk] = { t: v.map(k => k.t), o: v.map(k => k.o), h: v.map(k => k.h), l: v.map(k => k.l), c: v.map(k => k.c), v: v.map(k => k.v),
        n: nm.n || tk, sec: nm.sec || '', sp: nm.n ? 1 : 0, bxs: x.symbol };
      const c = info[x.symbol]; if (c) lev[tk] = +(c.maxLongLeverage || c.maxShortLeverage || 0) || null;
    } catch (e) { log(`${tk}: sin velas (${e.message})`); }
    if (i % 40 === 0) log(`… ${i}/${lista.length}`);
    await espera(60);
  }
  log(`Listo: ${Object.keys(D).length} acciones con velas.`);
  if (Object.keys(D).length < 5) process.exit(1);
  fs.writeFileSync(SALIDA, JSON.stringify({ at: Date.now(), d: D, lev, fuente: 'bingx' }));
}
main().catch(e => { console.error(e); process.exit(1); });
