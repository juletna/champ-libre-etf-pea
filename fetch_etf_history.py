"""
Alimente le Rétroviseur : récupère l'historique total-return de chaque support,
calcule les rendements mensuels et écrit un seul fichier etf_returns.json.

    pip install yfinance pandas
    python fetch_etf_history.py
"""

import json
import yfinance as yf
import pandas as pd

# ------------------------------------------------------------------
# Un seul endroit à éditer : tes supports.
# ------------------------------------------------------------------
SUPPORTS = [
    {"id": "world", "nom": "Monde",       "indice": "MSCI World",   "region": "Monde",            "ticker": "WPEA.PA", "color": "#34D399"},
    {"id": "usa",   "nom": "USA",         "indice": "S&P 500",      "region": "Amérique du Nord", "ticker": "ESE.PA",   "color": "#5B8DEF"},
    {"id": "tech",  "nom": "Tech US",     "indice": "Nasdaq-100",   "region": "Amérique du Nord", "ticker": "PUST.PA",  "color": "#B084F5"},
    {"id": "eur",   "nom": "Europe",      "indice": "Stoxx 600",    "region": "Europe",           "ticker": "ETZ.PA",   "color": "#E0A458"},
    {"id": "em",    "nom": "Émergents",   "indice": "MSCI EM",      "region": "Émergents",        "ticker": "PAEEM.PA", "color": "#EC6F9B"},
    {"id": "cash",  "nom": "Monétaire €", "indice": "€ court terme","region": "Monétaire",        "ticker": "OBLI.PA",  "color": "#94A3B8"},
]


def monthly_returns(ticker: str) -> pd.Series:
    """Rendements mensuels simples, total return (auto_adjust = dividendes réinvestis)."""
    df = yf.download(ticker, period="max", interval="1d",
                     auto_adjust=True, progress=False)
    if df.empty:
        print(f"  aucun historique pour {ticker}")
        return pd.Series(dtype=float)
    close = df["Close"].dropna()
    m = close.resample("M").last()          # dernière VL de chaque mois
    return m.pct_change().dropna()


def main():
    supports, returns = [], {}
    for s in SUPPORTS:
        print(f"-> {s['nom']} ({s['ticker']})")
        r = monthly_returns(s["ticker"])
        supports.append({k: s[k] for k in
                         ("id", "nom", "indice", "region", "ticker", "color")})
        returns[s["id"]] = [round(float(v), 6) for v in r.values]
        print(f"   {len(returns[s['id']])} mois")

    with open("etf_returns.json", "w") as f:
        json.dump({"supports": supports, "returns": returns},
                  f, ensure_ascii=False, indent=2)
    print("etf_returns.json ecrit.")


if __name__ == "__main__":
    main()
