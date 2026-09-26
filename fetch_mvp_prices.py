"""Actualise les cours mensuels ajustés du prototype (Yahoo Finance Chart API).

Les symboles sont vérifiés avec les reportings Amundi. Les barres du mois
en cours sont exclues.
"""

from datetime import date, datetime
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo
import json

ROOT = Path(__file__).resolve().parent
PROFILES = ROOT / "app/src/data/mvp-profiles.json"
OUTPUT = ROOT / "app/src/data/mvp-prices.json"
PARIS = ZoneInfo("Europe/Paris")


def fetch_monthly(ticker):
    url = (
        "https://query1.finance.yahoo.com/v8/finance/chart/"
        + quote(ticker)
        + "?range=max&interval=1mo&events=div%2Csplits"
    )
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=20) as response:
        result = json.load(response)["chart"]["result"][0]
    name = result["meta"].get("longName", "")
    if "Amundi" not in name:
        raise ValueError(f"Ticker non confirmé pour {ticker}: {name}")
    adjusted = result["indicators"]["adjclose"][0]["adjclose"]
    by_month = {}
    current_month = date.today().strftime("%Y-%m")
    for timestamp, price in zip(result["timestamp"], adjusted):
        month = datetime.fromtimestamp(timestamp, PARIS).strftime("%Y-%m")
        if price is not None and month < current_month:
            # L'API peut renvoyer des points hebdomadaires même avec interval=1mo.
            # Garder la dernière clôture disponible de chaque mois terminé.
            if month not in by_month or timestamp > by_month[month][0]:
                by_month[month] = (timestamp, round(float(price), 6))
    rows = [{"mois": month, "cours_ajuste": by_month[month][1]} for month in sorted(by_month)]
    if len(rows) < 12:
        raise ValueError(f"Historique incomplet pour {ticker}")
    return {"nom_yahoo": name, "historique": rows}


def main():
    profiles = json.loads(PROFILES.read_text(encoding="utf-8"))["etfs"]
    data = {
        "source": "Yahoo Finance Chart API, clôtures mensuelles ajustées (source de démonstration)",
        "date_extraction": date.today().isoformat(),
        "methode": "Dernière clôture ajustée de chaque mois terminé ; les dividendes sont pris en compte dans l'ajustement fourni par la source.",
        "par_isin": {},
    }
    for profile in profiles:
        isin, ticker = profile["isin"], profile["ticker_yahoo"]
        data["par_isin"][isin] = fetch_monthly(ticker)
        print(isin, ticker, len(data["par_isin"][isin]["historique"]))
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Écrit", OUTPUT)


if __name__ == "__main__":
    main()
