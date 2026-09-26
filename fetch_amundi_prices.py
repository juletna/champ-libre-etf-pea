"""Construit les historiques mensuels du simulateur depuis les VL ajustées Amundi.

La requête reprend les indicateurs utilisés par la fiche produit Amundi.
L'endpoint du site n'est pas une API publique documentée : vérifier le résultat
après chaque mise à jour. Les mois incomplets et les données antérieures à la
première VL officielle de la part sont exclus.
"""

from datetime import datetime
from collections import Counter
from bisect import bisect_right
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo
import json
import math
import time
import csv
import io

ROOT = Path(__file__).resolve().parent
CATALOG = ROOT / "etf_pea_fortuneo_amundi.json"
OUTPUT = ROOT / "app/src/data/mvp-prices.json"
API_URL = "https://www.amundietf.fr/mapi/ProductAPI/getProductsData"
FX_URL = "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=csvdata&startPeriod=2018-01-01"
PARIS = ZoneInfo("Europe/Paris")
CONTEXT = {
    "countryCode": "FRA", "countryName": "France", "googleCountryCode": "FR",
    "domainName": "www.amundietf.fr", "bcp47Code": "fr-FR",
    "languageName": "French", "languageCode": "fr",
    "userProfileName": "RETAIL", "userProfileSlug": "retail",
    "portalProfileName": None, "portalProfileSlug": None,
}
INDICATORS = ("countervalorisedAdjustedNAV", "officialNav", "navCurrency")


def fetch_batch(isins):
    payload = {
        "productType": "PRODUCT", "productIds": isins,
        "characteristics": ["ISIN", "SHARE_MARKETING_NAME"],
        "historics": [
            {"indicator": indicator, "startDate": "1000-01-01T00:00:00.000Z", "endDate": "2050-01-01T00:00:00.000Z"}
            for indicator in INDICATORS
        ],
        "metrics": [], "breakDown": {"aggregationFields": []}, "context": CONTEXT,
    }
    request = Request(API_URL, data=json.dumps(payload).encode(), headers={
        "User-Agent": "Mozilla/5.0", "Content-Type": "application/json",
        "Origin": "https://www.amundietf.fr", "Referer": "https://www.amundietf.fr/",
    })
    for attempt in range(3):
        try:
            with urlopen(request, timeout=45) as response:
                return json.load(response)["products"]
        except (HTTPError, URLError, TimeoutError):
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def fetch_usd_rates():
    request = Request(FX_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=45) as response:
        rows = csv.DictReader(io.TextIOWrapper(response, encoding="utf-8"))
        rates = {row["TIME_PERIOD"]: float(row["OBS_VALUE"]) for row in rows if row["OBS_VALUE"]}
    return sorted(rates), rates


def monthly_history(product, expected_currency, current_month, usd_rates):
    historics = {item["indicator"]: item.get("historicalData") or [] for item in product.get("historics", [])}
    official = historics.get("officialNav", [])
    adjusted = historics.get("countervalorisedAdjustedNAV", [])
    currencies = Counter(item["data"] for item in historics.get("navCurrency", []) if item.get("data"))
    if not official or not adjusted:
        raise ValueError("VL officielle ou ajustée absente")
    if not currencies or currencies[expected_currency] / sum(currencies.values()) < 0.99:
        raise ValueError(f"Devise majoritaire inattendue : {dict(currencies)} au lieu de {expected_currency}")
    first_official_date = min(item["date"] for item in official)
    fx_dates, fx_values = usd_rates
    by_month = {}
    for item in adjusted:
        timestamp, value = item["date"], item.get("data")
        if timestamp < first_official_date or not isinstance(value, (float, int)) or not math.isfinite(value) or value <= 0:
            continue
        observation_date = datetime.fromtimestamp(timestamp / 1000, PARIS).date().isoformat()
        month = observation_date[:7]
        if month >= current_month:
            continue
        if expected_currency == "USD":
            fx_index = bisect_right(fx_dates, observation_date) - 1
            if fx_index < 0 or (datetime.fromisoformat(observation_date) - datetime.fromisoformat(fx_dates[fx_index])).days > 5:
                raise ValueError(f"Taux BCE USD/EUR manquant près du {observation_date}")
            value /= fx_values[fx_dates[fx_index]]
        if month not in by_month or timestamp > by_month[month][0]:
            by_month[month] = (timestamp, value)
    rows = [{"mois": month, "cours_ajuste": round(by_month[month][1], 8)} for month in sorted(by_month)]
    if len(rows) < 2:
        raise ValueError("Moins de deux mois terminés disponibles")
    return rows


def main():
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))["etf"]
    by_isin = {item["isin"]: item for item in catalog}
    current_month = datetime.now(PARIS).strftime("%Y-%m")
    usd_rates = fetch_usd_rates()
    histories = {}
    errors = {}
    for index in range(0, len(catalog), 6):
        batch = catalog[index:index + 6]
        products = fetch_batch([item["isin"] for item in batch])
        returned = {product.get("productId"): product for product in products}
        for item in batch:
            isin = item["isin"]
            try:
                product = returned[isin]
                if product.get("characteristics", {}).get("ISIN") != isin:
                    raise ValueError("ISIN retourné différent")
                rows = monthly_history(product, by_isin[isin]["devise_part"], current_month, usd_rates)
                histories[isin] = {
                    "nom_amundi": product["characteristics"]["SHARE_MARKETING_NAME"],
                    "devise_origine": item["devise_part"], "devise": "EUR", "historique": rows,
                }
                print(isin, len(rows), rows[0]["mois"], rows[-1]["mois"])
            except (KeyError, ValueError) as error:
                errors[isin] = str(error)
                print(isin, "INDISPONIBLE", error)
    data = {
        "source": "Amundi ETF, VL ajustée ; conversion USD/EUR par taux de référence BCE pour la part en USD",
        "url_source": API_URL,
        "url_change": FX_URL,
        "date_extraction": datetime.now(PARIS).date().isoformat(),
        "methode": "Dernière VL ajustée disponible de chaque mois terminé, à partir de la première VL officielle de chaque part. Distributions prises en compte dans la série ajustée Amundi. Part en USD convertie en EUR au taux BCE du jour ou du dernier jour ouvré précédent.",
        "par_isin": histories,
    }
    if errors:
        print("Écriture annulée : séries manquantes", errors)
        raise SystemExit(1)
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Écrit", OUTPUT, "pour", len(histories), "ETF")


if __name__ == "__main__":
    main()
