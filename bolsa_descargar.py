# =====================================================================
#  Escáner Bolsa · paso 1: descarga velas de 15m desde Yahoo Finance
#  (S&P 500 + SPY, QQQ y VIX) y las guarda en un archivo temporal.
#  Se ejecuta en GitHub Actions; no necesita clave.
# =====================================================================
import csv, io, json, os, sys, time, urllib.request
from datetime import datetime, timezone

import yfinance as yf

AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.environ.get('CRUDO', '/tmp/bolsa_crudo.json')
LISTA_URL = 'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv'
EXTRA = [('SPY', 'SPDR S&P 500 ETF', 'ETF'), ('QQQ', 'Invesco QQQ (Nasdaq 100)', 'ETF'), ('^VIX', 'Índice de volatilidad VIX', 'Índice')]
SECTOR_ES = {
    'Information Technology': 'Tecnología', 'Communication Services': 'Comunicaciones', 'Consumer Discretionary': 'Consumo',
    'Consumer Staples': 'Consumo básico', 'Health Care': 'Salud', 'Financials': 'Finanzas', 'Industrials': 'Industria',
    'Energy': 'Energía', 'Utilities': 'Servicios públicos', 'Real Estate': 'Inmobiliario', 'Materials': 'Materiales',
}

def log(*a):
    print(datetime.now().strftime('%H:%M:%S'), '|', *a, flush=True)

def leer_lista():
    texto = None
    try:
        with urllib.request.urlopen(LISTA_URL, timeout=20) as r:
            texto = r.read().decode('utf-8')
        log('Lista del S&P 500 descargada.')
    except Exception as e:
        log('No se pudo descargar la lista; uso la copia guardada:', e)
    if not texto:
        with open(os.path.join(AQUI, 'bolsa_lista.csv'), encoding='utf-8') as f:
            texto = f.read()
    filas = list(csv.DictReader(io.StringIO(texto)))
    lista = [(f['Symbol'].strip(), f['Security'].strip(), SECTOR_ES.get(f['GICS Sector'].strip(), f['GICS Sector'].strip())) for f in filas if f.get('Symbol')]
    return lista + EXTRA

def a_yahoo(s):
    return s.replace('.', '-')   # BRK.B -> BRK-B

def descargar(simbolos, intentos=3):
    for n in range(1, intentos + 1):
        try:
            return yf.download(simbolos, period='60d', interval='15m', group_by='ticker', auto_adjust=False,
                               prepost=False, threads=True, progress=False)
        except Exception as e:
            log(f'Intento {n} falló:', e)
            time.sleep(5 * n)
    return None

def main():
    lista = leer_lista()
    info = {s: {'n': n, 'sec': sec} for s, n, sec in lista}
    simbolos = [s for s, _, _ in lista]
    datos = {}
    LOTE = 100
    for i in range(0, len(simbolos), LOTE):
        lote = simbolos[i:i + LOTE]
        y2s = {a_yahoo(s): s for s in lote}
        log(f'Descargando {i + 1}–{i + len(lote)} de {len(simbolos)}…')
        df = descargar(list(y2s.keys()))
        if df is None or df.empty:
            log('Lote vacío.'); continue
        for ys, s in y2s.items():
            try:
                d = df[ys] if len(y2s) > 1 else df
                d = d.dropna(subset=['Open', 'High', 'Low', 'Close'])
                if len(d) < 300:
                    continue
                d = d.tail(1100)
                t = [int(x.timestamp() * 1000) for x in d.index]
                datos[s] = {
                    't': t,
                    'o': [round(float(x), 4) for x in d['Open']], 'h': [round(float(x), 4) for x in d['High']],
                    'l': [round(float(x), 4) for x in d['Low']], 'c': [round(float(x), 4) for x in d['Close']],
                    'v': [int(x) if x == x else 0 for x in d['Volume']],
                    **info.get(s, {}),
                }
            except Exception as e:
                log(f'{s}: sin datos ({e})')
        time.sleep(2)
    log(f'Listo: {len(datos)} símbolos con datos.')
    if len(datos) < 50:
        log('Muy pocos símbolos; Yahoo pudo haber bloqueado la descarga. No se actualiza.')
        sys.exit(1)
    with open(SALIDA, 'w') as f:
        json.dump({'at': int(datetime.now(timezone.utc).timestamp() * 1000), 'd': datos}, f)

if __name__ == '__main__':
    main()
