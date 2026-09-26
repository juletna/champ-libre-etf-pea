"""Met à jour les encours des fonds du catalogue depuis Amundi ETF.

FUND_AUM_IN_EURO correspond à l'encours du fonds, toutes parts confondues.
L'endpoint du site n'est pas une API publique documentée : vérifier la réponse
après chaque mise à jour.
"""

from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
import json
import math

from fetch_amundi_prices import API_URL, CONTEXT


ROOT = Path(__file__).resolve().parent
CATALOG = ROOT / "etf_pea_fortuneo_amundi.json"
OUTPUT = ROOT / "app/src/data/mvp-fund-sizes.json"


def fetch_batch(isins):
    payload = {
        "productType": "PRODUCT",
        "productIds": isins,
        "characteristics": ["ISIN", "FUND_AUM_IN_EURO", "NAV_DATE_DISPLAYED"],
        "historics": [],
        "metrics": [],
        "breakDown": {"aggregationFields": []},
        "context": CONTEXT,
    }
    request = Request(API_URL, data=json.dumps(payload).encode(), headers={
        "User-Agent": "Mozilla/5.0",
        "Content-Type": "application/json",
        "Origin": "https://www.amundietf.fr",
        "Referer": "https://www.amundietf.fr/",
    })
    with urlopen(request, timeout=45) as response:
        return json.load(response)["products"]


def main():
    isins = [item["isin"] for item in json.loads(CATALOG.read_text(encoding="utf-8"))["etf"]]
    sizes = {}
    for index in range(0, len(isins), 6):
        for product in fetch_batch(isins[index:index + 6]):
            fields = product.get("characteristics", {})
            isin = product.get("productId")
            value = fields.get("FUND_AUM_IN_EURO")
            timestamp = fields.get("NAV_DATE_DISPLAYED")
            if fields.get("ISIN") != isin or isin not in isins:
                raise ValueError(f"ISIN incohérent : {isin}")
            if not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
                raise ValueError(f"Encours invalide : {isin} {value}")
            if not isinstance(timestamp, (int, float)):
                raise ValueError(f"Date manquante : {isin}")
            sizes[isin] = {
                "encours_fonds_eur": round(value),
                "date": datetime.fromtimestamp(timestamp / 1000, timezone.utc).date().isoformat(),
            }
    if set(sizes) != set(isins):
        raise ValueError(f"Encours manquants : {sorted(set(isins) - set(sizes))}")
    data = {
        "source": "Amundi ETF — encours du fonds en EUR (FUND_AUM_IN_EURO)",
        "url_source": API_URL,
        "date_extraction": datetime.now(timezone.utc).date().isoformat(),
        "par_isin": sizes,
    }
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Écrit {OUTPUT} pour {len(sizes)} ETF")


if __name__ == "__main__":
    main()
