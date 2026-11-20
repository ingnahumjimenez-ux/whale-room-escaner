// =====================================================================
//  Escáner Bolsa · paso 2: analiza las velas con el MISMO motor del escáner v3
//  (se carga desde index.html) y escribe data/bolsa.json para la app.
// =====================================================================
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = AQUI;   // todos los archivos están en la raíz del repositorio
const HTML = process.env.HTML_V3 || path.join(RAIZ, 'index.html');
const CRUDO = process.env.CRUDO || '/tmp/bolsa_crudo.json';
const SALIDA = process.env.SALIDA || path.join(RAIZ, 'data', 'bolsa.json');
const VELAS = 1000, MIN_PUNTAJE = 70, MIN_CONF = 2, VELAS_GRAFICA = 60, MAX_SENALES = 320;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), '|', ...a);

/* ---------- carga el motor de v3 sin navegador ---------- */
function elementoFalso() {
  return new Proxy({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, value: '', checked: false, files: [] }, {
    get(o, k) { if (k in o) return o[k]; if (k === 'querySelectorAll') return () => []; if (k === 'querySelector' || k === 'closest') return () => elementoFalso(); if (k === 'getContext') return () => ctx2d(); if (k === 'getBoundingClientRect') return () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }); return typeof k === 'string' && /^(on|inner|text|src|href|title|id|class)/.test(k) ? '' : (() => elementoFalso()); },
    set(o, k, v) { o[k] = v; return true; }
  });
}
function ctx2d() { return new Proxy({}, { get: (o, k) => k === 'measureText' ? () => ({ width: 0 }) : (k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } }); }
function cargarMotor() {
  const html = fs.readFileSync(HTML, 'utf8');
  const bloques = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const codigo = bloques.sort((a, b) => b.length - a.length)[0];   // el bloque principal del escáner
  const datos = {};
  const almacen = { getItem: k => (k in datos ? datos[k] : null), setItem: (k, v) => { datos[k] = String(v); }, removeItem: k => { delete datos[k]; } };
  const elementos = new Map();
  const documento = {
    hidden: true, title: '', head: elementoFalso(), body: elementoFalso(), documentElement: elementoFalso(),
    getElementById(id) { if (!elementos.has(id)) elementos.set(id, elementoFalso()); return elementos.get(id); },
    createElement: () => elementoFalso(), querySelector: () => elementoFalso(), querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {}, execCommand() {}
  };
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {} }, Intl, Date, Math, JSON, Promise, Map, Set, WeakMap, Array, Object, Number, String, Boolean, RegExp, Error, TypeError, Symbol, Proxy, Reflect,
    URLSearchParams, URL, Float64Array, Int8Array, Uint8Array, encodeURIComponent, decodeURIComponent, isFinite, isNaN, parseInt, parseFloat, structuredClone,
    fetch: () => Promise.reject(new Error('sin red en el analizador')), setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0,
    localStorage: almacen, sessionStorage: almacen, navigator: { serviceWorker: { register: () => Promise.resolve() }, clipboard: {} }, document: documento, location: { href: '', search: '' },
    devicePixelRatio: 1, innerWidth: 400, innerHeight: 800, scrollTo() {}, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    Image: function () { return elementoFalso(); }, Notification: { permission: 'denied' }, Audio: function () { return { play() { return Promise.resolve(); } }; }
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  try { vm.runInContext(codigo, ctx, { filename: 'index.html' }); }
  catch (e) { log('Aviso al cargar index.html (se continúa):', e.message); }
  const f = n => vm.runInContext(`typeof ${n}==='function'?${n}:null`, ctx);
  const M = { analyzeDir: f('analyzeDir'), optOf: f('optOf'), computeProjection: f('computeProjection'), trendOf: f('trendOf') };
  for (const [k, v] of Object.entries(M)) if (!v) throw new Error(`No se encontró la función ${k} en index.html`);
  return M;
}

/* ---------- utilidades de velas ---------- */
const diaNY = t => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(t));
function aVelas(x) { return x.t.map((t, i) => ({ t, o: x.o[i], h: x.h[i], l: x.l[i], c: x.c[i], v: x.v[i] || 0 })); }
function porDia(K) { const m = new Map(); for (const k of K) { const d = diaNY(k.t); if (!m.has(d)) m.set(d, []); m.get(d).push(k); } return [...m.values()]; }
function agrupar(K, n) {   // 15m -> 1H (4) o 4H (16), contando desde la apertura de cada día
  const out = [];
  for (const dia of porDia(K)) for (let i = 0; i < dia.length; i += n) {
    const g = dia.slice(i, i + n);
    out.push({ t: g[0].t, o: g[0].o, h: Math.max(...g.map(k => k.h)), l: Math.min(...g.map(k => k.l)), c: g[g.length - 1].c, v: g.reduce((a, k) => a + k.v, 0) });
  }
  return out;
}
function extras(K) {
  const dias = porDia(K), hoy = dias[dias.length - 1], ayer = dias[dias.length - 2];
  const res = { gap: null, rv: null, dv: 0, ch: null };
  if (ayer && hoy) {
    const pc = ayer[ayer.length - 1].c, op = hoy[0].o, gp = (op / pc - 1) * 100;
    res.ch = (hoy[hoy.length - 1].c / pc - 1) * 100;
    if (Math.abs(gp) >= 0.3) {
      const ext = gp > 0 ? Math.min(...hoy.map(k => k.l)) : Math.max(...hoy.map(k => k.h));
      res.gap = { p: +gp.toFixed(2), f: +Math.max(0, Math.min(1, (gp > 0 ? op - ext : ext - op) / Math.abs(op - pc))).toFixed(2) };
    }
    const n = hoy.length, prev = dias.slice(-21, -1).filter(d => d.length >= n);
    const mismo = prev.map(d => d.slice(0, n).reduce((a, k) => a + k.v, 0));
    const hoyV = hoy.reduce((a, k) => a + k.v, 0);
    if (mismo.length >= 5) { const avg = mismo.reduce((a, b) => a + b, 0) / mismo.length; if (avg > 0) res.rv = +(hoyV / avg).toFixed(2); }
  }
  const completos = dias.slice(-21, -1);
  if (completos.length) res.dv = Math.round(completos.reduce((a, d) => a + d.reduce((s, k) => s + k.c * k.v, 0), 0) / completos.length);
  return res;
}
const r4 = x => (x == null || !isFinite(x)) ? null : +(+x).toPrecision(6);

/* ---------- lista de acciones que se operan en BingX (futuros perpetuos) ---------- */
async function listaBingX(cachePath) {
  const url = 'https://open-api.bingx.com/openApi/swap/v2/quote/contracts?timestamp=' + Date.now();
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'escaner-bolsa' } });
    const j = await r.json();
    const lista = {};
    for (const c of (j.data || [])) {
      const sym = String(c.symbol || '');
      const m = sym.match(/^NCSK([A-Z.]+?)2USD-USDT$/);     // formato de BingX para acciones (ej. NCSKTSLA2USD-USDT)
      if (!m) continue;
      if (c.status != null && +c.status !== 1) continue;    // solo contratos activos
      const lev = +(c.maxLongLeverage || c.maxLeverage || c.maxShortLeverage || 0) || null;
      lista[m[1]] = { c: sym, lev };
    }
    if (Object.keys(lista).length >= 5) {
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify({ at: Date.now(), lista }));
      log(`BingX: ${Object.keys(lista).length} acciones con futuros perpetuos.`);
      return lista;
    }
    log('BingX respondió sin acciones; uso la copia guardada.');
  } catch (e) { log('No se pudo leer la lista de BingX; uso la copia guardada:', e.message); }
  try { return JSON.parse(fs.readFileSync(cachePath, 'utf8')).lista; } catch (e) { return null; }
}


/* =====================================================================
   PLAN DE MAÑANA (se ejecuta al cierre con PLAN=1): gaps pendientes,
   setups que quedaron cerca de su entrada y acciones a evitar por resultados.
   ===================================================================== */
function proximaSesion(t) {   // siguiente día hábil (no considera feriados)
  const d = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(t)) + 'T12:00:00Z');
  do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}
function atrDiario(dias) { const r = dias.slice(-15, -1).map(d => (Math.max(...d.map(k => k.h)) - Math.min(...d.map(k => k.l)))); return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null; }
function atr15(K) { let s = 0, n = 0; for (let i = Math.max(1, K.length - 14); i < K.length; i++) { s += Math.max(K[i].h - K[i].l, Math.abs(K[i].h - K[i - 1].c), Math.abs(K[i].l - K[i - 1].c)); n++; } return n ? s / n : null; }
function gapsDe(dias) {   // todos los gaps entre días con su estado (rellenado o pendiente)
  const out = [];
  for (let i = 1; i < dias.length; i++) {
    const pc = dias[i - 1][dias[i - 1].length - 1].c, op = dias[i][0].o, g = op / pc - 1;
    if (Math.abs(g) < 0.003) continue;
    let lleno = -1;   // índice del día en que se rellenó
    for (let j = i; j < dias.length && lleno < 0; j++) for (const k of dias[j]) { if (g > 0 ? k.l <= pc : k.h >= pc) { lleno = j; break; } }
    out.push({ i, pc, g, lleno });
  }
  return out;
}
function planCierre(D, M, out, BX) {
  const PLAN = path.join(path.dirname(SALIDA), 'plan.json');
  // 1) estadística de relleno: gaps de cada tamaño cerrados en ≤ 3 sesiones (todas las acciones)
  const cubo = g => { const a = Math.abs(g) * 100; return a < 1 ? 0 : a < 2 ? 1 : a < 4 ? 2 : 3; };
  const st = [0, 1, 2, 3].map(() => ({ n: 0, ok: 0 }));
  const porSym = {};
  for (const [sym, x] of Object.entries(D)) {
    if (sym === '^VIX') continue;
    const K = aVelas(x), dias = porDia(K); if (dias.length < 10) continue;
    const G = gapsDe(dias); porSym[sym] = { K, dias, G };
    for (const g of G) { if (g.i > dias.length - 4) continue; const c = st[cubo(g.g)]; c.n++; if (g.lleno >= 0 && g.lleno - g.i <= 2) c.ok++; }
  }
  const tasa = g => { const c = st[cubo(g)]; return c.n >= 20 ? +(c.ok / c.n).toFixed(2) : null; };
  // 2) gaps pendientes cerca del precio
  const gaps = [];
  for (const [sym, { K, dias, G }] of Object.entries(porSym)) {
    if (sym === 'SPY' || sym === 'QQQ') continue;
    const c = K[K.length - 1].c, ad = atrDiario(dias); if (!ad) continue;
    const pend = G.filter(g => g.lleno < 0 && g.i >= dias.length - 30).map(g => ({ ...g, d: g.pc / c - 1 })).filter(g => Math.abs(g.d) >= 0.003 && Math.abs(g.d) <= 0.03);
    if (!pend.length) continue;
    const g = pend.sort((a, b) => Math.abs(a.d) - Math.abs(b.d))[0];
    const dir = g.d > 0 ? 'long' : 'short', sh = dir === 'short';
    const sl = sh ? c + 0.5 * ad : c - 0.5 * ad, rr = Math.abs(g.pc - c) / Math.abs(c - sl);
    if (rr < 0.8) continue;
    const a15 = atr15(K) || ad / 26;
    const ses = Math.abs(g.pc - c) / ad < 0.5 ? [1, 1] : Math.abs(g.pc - c) / ad < 1 ? [1, 2] : [2, 3];
    let h1 = null, h4 = null; try { h1 = M.trendOf(agrupar(K.slice(-VELAS), 4)); h4 = M.trendOf(agrupar(K.slice(-VELAS), 16)); } catch (e) {}
    gaps.push({ s: sym, n: D[sym].n || sym, dir, c: r4(c), lvl: r4(g.pc), d: +(g.d * 100).toFixed(2), gp: +(g.g * 100).toFixed(2), dias: dias.length - 1 - g.i,
      el: r4(sh ? c : c - 0.2 * a15), eh: r4(sh ? c + 0.2 * a15 : c), em: r4(c), sst: r4(sl), rr: +rr.toFixed(2), ses, tasa: tasa(g.g), ctx: { h1, h4 },
      bx: BX && (BX[sym] || BX[sym.replace('.', '')]) ? 1 : 0, dv: out.px[sym] ? out.px[sym][2] : 0 });
  }
  gaps.sort((a, b) => Math.abs(a.d) - Math.abs(b.d));
  // 3) setups del escáner que cerraron dentro o cerca de su zona de entrada (≤ 3 ATR de 15m)
  const setups = [];
  for (const s of out.sig) {
    const pz = porSym[s.s]; if (!pz) continue;
    const a15 = atr15(pz.K); if (!a15) continue;
    const dist = s.c < s.el ? s.el - s.c : s.c > s.eh ? s.c - s.eh : 0;
    if (dist > 3 * a15) continue;
    const { K, ...rest } = s;
    setups.push({ ...rest, dz: +(dist / s.c * 100).toFixed(2), enz: dist === 0 ? 1 : 0 });
  }
  const plan = { v: 1, gen: Date.now(), at: out.at, para: proximaSesion(out.at), stats: st.map(c => c.n ? +(c.ok / c.n).toFixed(2) : null), gaps: gaps.slice(0, 80), setups: setups.slice(0, 120), pre: null };
  fs.writeFileSync(PLAN, JSON.stringify(plan));
  log(`Plan de mañana (${plan.para}): ${setups.length} setups cerca de su entrada, ${gaps.length} gaps pendientes. Relleno ≤3 sesiones por tamaño: ${plan.stats.map(x => x == null ? '—' : Math.round(x * 100) + '%').join(' / ')}`);
}
/* ---------- principal ---------- */
async function main() {
  const crudo = JSON.parse(fs.readFileSync(CRUDO, 'utf8'));
  const M = cargarMotor();
  log('Motor de v3 cargado.');
  const D = crudo.d;
  const tr = (sym, n) => D[sym] ? M.trendOf(n ? agrupar(aVelas(D[sym]).slice(-VELAS), n) : aVelas(D[sym]).slice(-VELAS)) : null;
  const ult = sym => { if (!D[sym]) return null; const K = aVelas(D[sym]), e = extras(K); return { c: K[K.length - 1].c, ch: e.ch == null ? null : +e.ch.toFixed(2) }; };
  const M24 = process.env.MODO === '24' || crudo.fuente === 'bingx';   // universo BingX 24/7 (precios de BingX)
  let base = null; if (M24) { try { base = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'bolsa.json'), 'utf8')); } catch (e) {} }
  const mkt = M24 ? ((base && base.mkt) || { spy: {}, qqq: {}, vix: null }) : {
    spy: { m15: tr('SPY'), h1: tr('SPY', 4), h4: tr('SPY', 16), ...ult('SPY') },
    qqq: { h1: tr('QQQ', 4), h4: tr('QQQ', 16), ...ult('QQQ') },
    vix: ult('^VIX')
  };
  const BX = M24 ? Object.fromEntries(Object.keys(D).map(k => [k, { c: D[k].bxs, lev: (crudo.lev || {})[k] || null }])) : await listaBingX(path.join(path.dirname(SALIDA), 'bingx.json'));
  const enBX = sym => !!(BX && (BX[sym] || BX[sym.replace('.', '')]));
  const cfg = { market: 'stocks', tf: '15m', limit: VELAS, minVol: 0, minScore: MIN_PUNTAJE, dir: 'both', minCores: MIN_CONF, pivot: 5, closedOnly: false };
  const px = {}, sig = [];
  let ultima = 0, n = 0;
  for (const [sym, x] of Object.entries(D)) {
    if (sym === '^VIX') continue;
    const K = aVelas(x).slice(-VELAS);
    if (K.length < 300) continue;
    const e = extras(K), c = K[K.length - 1].c;
    if (M24) e.gap = null;   // en BingX el precio se mueve toda la noche: no hay gap de apertura
    ultima = Math.max(ultima, K[K.length - 1].t);
    px[sym] = [r4(c), e.ch == null ? null : +e.ch.toFixed(2), e.dv];
    n++;
    let h1 = null, h4 = null;
    for (const dir of ['long', 'short']) {
      let r = null;
      try { r = M.analyzeDir(sym, K, cfg, e.dv, dir); } catch (err) { r = null; }
      if (!r) continue;
      r.tf = '15m'; r.dir = dir;
      if (h1 == null) { h1 = M.trendOf(agrupar(K, 4)); h4 = M.trendOf(agrupar(K, 16)); }
      let O = null, P5 = null;
      try { O = M.optOf(r); } catch (err) {}
      try { P5 = M.computeProjection(r.K, r.close, O ? O.stop.stop : r.stop, r.targets[4].p, dir, r.atrPct, '15m'); } catch (err) {}
      let PO = null;
      try { if (O && O.best) PO = M.computeProjection(r.K, r.close, O.stop.stop, r.targets[O.best.k - 1].p, dir, r.atrPct, '15m'); } catch (err) {}
      const rows = O ? O.rows : [];
      sig.push({
        s: sym, n: x.n || sym, sec: x.sec || '', sp: M24 ? (x.sp ? 1 : 0) : 1, dir, sc: r.score, co: r.cores,
        tg: [!!r.hasFVG, !!r.hasTL, !!r.hasLvl, !!r.pullback, !!r.confluent],
        el: r4(r.entryLow), eh: r4(r.entryHigh), em: r4(r.entryMid), st: r4(r.stop), sst: O ? r4(O.stop.stop) : r4(r.stop),
        tp: r.targets.map(t => r4(t.p)), rr: r.targets.map(t => +(t.rr || 0).toFixed(2)),
        pr: rows.map(o => o ? +o.prob.toFixed(3) : null), ev: rows.map(o => o ? +o.ev.toFixed(2) : null), ob: O && O.best ? O.best.k : null,
        p5: P5 ? { lo: P5.loMs, hi: P5.hiMs, p: +P5.prob.toFixed(3) } : null,
        po: PO ? { lo: PO.loMs, hi: PO.hiMs } : null, bx: enBX(sym) ? 1 : 0,
        d: r.d, c: r4(c), atr: +(r.atrPct || 0).toFixed(4), ctx: { h1, h4 }, gap: e.gap, rv: e.rv, dv: e.dv,
        K: K.slice(-VELAS_GRAFICA).map(k => [k.t, r4(k.o), r4(k.h), r4(k.l), r4(k.c)])
      });
    }
  }
  const veOf = x => (x.ob && x.ev[x.ob - 1] != null) ? x.ev[x.ob - 1] : -9;
  sig.sort((a, b) => (b.sc - a.sc) || (veOf(b) - veOf(a)) || ((b.dv || 0) - (a.dv || 0)));
  const fuera = sig.slice(MAX_SENALES).filter(x => x.bx);   // las de BingX siempre se conservan
  sig.splice(MAX_SENALES);
  sig.push(...fuera);
  const bx = BX ? Object.keys(BX).filter(k => D[k] || D[k.replace(/([A-Z])([A-Z])$/, '$1.$2')]).sort() : null;
  const out = { v: 1, m24: M24 ? 1 : 0, er: M24 && base ? base.er : undefined, gen: Date.now(), at: ultima, n, mkt, px, sig, bx, bxLev: BX ? Object.fromEntries(Object.entries(BX).filter(([, v]) => v.lev).map(([k, v]) => [k, v.lev])) : null };
  try {
    const prev = JSON.parse(fs.readFileSync(SALIDA, 'utf8'));
    if (prev.at === ultima && process.env.FORZAR !== '1') { log('Sin velas nuevas desde el último análisis (mercado cerrado o feriado). No se actualiza.'); return; }
  } catch (e) {}
  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, JSON.stringify(out));
  log(`Listo: ${n} acciones analizadas, ${sig.length} señales, ${bx ? bx.length : 0} en BingX. Archivo ${(fs.statSync(SALIDA).size / 1024).toFixed(0)} KB.`);
  if (process.env.PLAN === '1' && !M24) planCierre(D, M, out, BX);
}
main().catch(e => { console.error(e); process.exit(1); });
