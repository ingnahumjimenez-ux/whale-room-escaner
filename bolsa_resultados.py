# =====================================================================
#  Escáner Bolsa · paso 3: fechas de resultados trimestrales (earnings)
#  para las acciones con señal y las de mayor volumen. Se guarda en caché
#  (data/bolsa_er.json) y se renueva cada 3 días por acción.
# =====================================================================
import json, os, time
from datetime import date, datetime, timedelta

import yfinance as yf

RAIZ = os.path.dirname(os.path.abspath(__file__))   # raíz del repositorio
BOLSA = os.path.join(RAIZ, 'data', 'bolsa.json')
CACHE = os.path.join(RAIZ, 'data', 'bolsa_er.json')
MAX_NUEVAS = 70   # consultas nuevas por ejecución (para no tardar ni molestar a Yahoo)

def log(*a): print(datetime.now().strftime('%H:%M:%S'), '|', *a, flush=True)

def proxima(sym):
    t = yf.Ticker(sym.replace('.', '-'))
    try:
        cal = t.calendar or {}
        fechas = cal.get('Earnings Date') or []
        futuras = sorted(f for f in fechas if f >= date.today() - timedelta(days=1))
        if futuras: return futuras[0].isoformat()
    except Exception: pass
    try:
        df = t.get_earnings_dates(limit=8)
        if df is not None and len(df):
            futuras = sorted(d.date() for d in df.index if d.date() >= date.today() - timedelta(days=1))
            if futuras: return futuras[0].isoformat()
    except Exception: pass
    return None

def main():
    B = json.load(open(BOLSA))
    try: C = json.load(open(CACHE))
    except Exception: C = {}
    hoy = date.today()
    quiero = [s['s'] for s in B['sig']]
    top = sorted(((v[2] or 0, k) for k, v in B['px'].items() if k not in ('SPY', 'QQQ')), reverse=True)[:60]
    quiero += [k for _, k in top]
    vistos, nuevas = [], 0
    for s in quiero:
        if s in vistos or s in ('SPY', 'QQQ'): continue
        vistos.append(s)
        c = C.get(s)
        viejo = (not c) or (date.fromisoformat(c['at']) < hoy - timedelta(days=3)) or (c.get('d') and date.fromisoformat(c['d']) < hoy)
        if not viejo or nuevas >= MAX_NUEVAS: continue
        C[s] = {'d': proxima(s), 'at': hoy.isoformat()}; nuevas += 1
        time.sleep(0.4)
    json.dump(C, open(CACHE, 'w'))
    B['er'] = {s: C[s]['d'] for s in vistos if C.get(s, {}).get('d')}
    json.dump(B, open(BOLSA, 'w'), separators=(',', ':'))
    log(f'Resultados: {nuevas} consultas nuevas, {len(B["er"])} fechas en el archivo.')

if __name__ == '__main__':
    main()
