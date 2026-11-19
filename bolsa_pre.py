# =====================================================================
#  Escáner Bolsa · confirmación de pre-mercado (8:00–8:30 a.m. El Salvador)
#  Lee data/plan.json, mira el precio de pre-mercado de cada acción del plan
#  en Yahoo y marca: ok (sigue el plan) · no (descartar) · ojo (vigilar).
# =====================================================================
import json, os, time
from datetime import datetime, timezone

import yfinance as yf

RAIZ = os.path.dirname(os.path.abspath(__file__))
PLAN = os.path.join(RAIZ, 'data', 'plan.json')

def log(*a): print(datetime.now().strftime('%H:%M:%S'), '|', *a, flush=True)

def precios_pre(simbolos):
    res = {}
    for i in range(0, len(simbolos), 80):
        lote = simbolos[i:i + 80]
        y2s = {s.replace('.', '-'): s for s in lote}
        try:
            df = yf.download(list(y2s.keys()), period='1d', interval='5m', prepost=True, group_by='ticker', progress=False, threads=True)
        except Exception as e:
            log('Lote falló:', e); continue
        for ys, s in y2s.items():
            try:
                d = df[ys] if len(y2s) > 1 else df
                d = d.dropna(subset=['Close'])
                if len(d): res[s] = float(d['Close'].iloc[-1])
            except Exception:
                pass
        time.sleep(1)
    return res

def juzgar(it, p, tipo):
    """Devuelve (estado, texto) para una acción del plan según el precio de pre-mercado."""
    c = it['c']; g = (p / c - 1) * 100; sh = it['dir'] == 'short'
    if abs(g) >= 4:
        return 'no', f'pre-mercado {g:+.1f} % → salto muy grande, descartar'
    if tipo == 'gap':
        lvl = it['lvl']
        if (not sh and p >= lvl) or (sh and p <= lvl):
            return 'no', f'pre-mercado {g:+.1f} % → el gap ya se cerró, descartar'
        if (not sh and p <= it['sst']) or (sh and p >= it['sst']):
            return 'no', f'pre-mercado {g:+.1f} % → abre más allá del SL, descartar'
        lejos = (lvl - p) / p * 100 if not sh else (p - lvl) / p * 100
        if lejos > abs(it['d']) + 1.5:
            return 'ojo', f'pre-mercado {g:+.1f} % → el gap quedó más lejos, solo si recupera'
        return 'ok', f'pre-mercado {g:+.1f} % → confirmado, sigue el plan'
    # setup del escáner
    el, eh, sl, tp = it['el'], it['eh'], it['sst'], it['tp'][(it.get('ob') or 1) - 1]
    if (sh and p >= sl) or (not sh and p <= sl):
        return 'no', f'pre-mercado {g:+.1f} % → abre más allá del SL, descartar'
    if (sh and p <= tp) or (not sh and p >= tp):
        return 'no', f'pre-mercado {g:+.1f} % → ya llegó al TP, descartar'
    if el <= p <= eh:
        return 'ok', f'pre-mercado {g:+.1f} % → abre dentro de la zona, confirmado'
    hacia = (sh and p > c) or (not sh and p < c)
    if hacia:
        return 'ok', f'pre-mercado {g:+.1f} % → se acerca a la zona, confirmado'
    return 'ojo', f'pre-mercado {g:+.1f} % → se aleja de la zona, esperar a que vuelva'

def main():
    P = json.load(open(PLAN))
    items = [('gap', x) for x in P.get('gaps', [])] + [('set', x) for x in P.get('setups', [])]
    syms = sorted({x['s'] for _, x in items})
    log(f'Plan para {P.get("para")}: {len(syms)} acciones a revisar en pre-mercado.')
    px = precios_pre(syms)
    out = {}
    for tipo, x in items:
        p = px.get(x['s'])
        if p is None: continue
        st, txt = juzgar(x, p, tipo)
        out[f"{tipo}:{x['s']}:{x['dir']}"] = {'p': round(p, 4), 'g': round((p / x['c'] - 1) * 100, 2), 'st': st, 'txt': txt}
    P['pre'] = {'at': int(datetime.now(timezone.utc).timestamp() * 1000), 'items': out}
    json.dump(P, open(PLAN, 'w'), separators=(',', ':'))
    n = {k: sum(1 for v in out.values() if v['st'] == k) for k in ('ok', 'ojo', 'no')}
    log(f'Confirmación lista: {n["ok"]} confirmadas, {n["ojo"]} vigilar, {n["no"]} descartadas, {len(px)} precios.')

if __name__ == '__main__':
    main()
