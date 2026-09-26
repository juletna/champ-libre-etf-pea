"""Audite les tableaux pays/secteurs des reportings mensuels Amundi.

N'écrit jamais dans mvp-profiles.json : les graphiques PDF ambigus doivent être
contrôlés visuellement avant intégration. Requiert pdftotext (Poppler).
"""

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import json
from pathlib import Path
import re
import subprocess
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
CATALOG = ROOT / "etf_pea_fortuneo_amundi.json"
PROFILES = ROOT / "app/src/data/mvp-profiles.json"
HEADINGS = {
    "pays": re.compile(r"^Répartition géographique de l.indice \(source : Amundi\)", re.I | re.M),
    "secteurs": re.compile(r"^Secteurs de l.indice \(source : Amundi\)", re.I | re.M),
}
PERCENT = re.compile(r"^\s*(\d{1,3},\d{1,2})\s*%\s*(.*)$")
REPORT_BASE = "https://www.amundietf.fr/pdfDocuments/monthly-factsheet/{isin}/FRA/FRA/{profile}/ETF"


def extract_chart(text, heading):
    match = heading.search(text)
    if not match:
        return {"status": "absent"}

    values, labels = [], []
    in_labels = False
    for line in text[match.end():].splitlines():
        line = line.strip()
        if not line:
            continue
        percent = PERCENT.match(line)
        if not in_labels and percent:
            values.append(float(percent.group(1).replace(",", ".")))
            if percent.group(2):
                labels.append(percent.group(2))
        elif values and re.match(r"^0\s*%", line):
            break  # Axe du graphique, puis légende et tableau suivant.
        elif values:
            in_labels = True
            labels.append(line)
        if len(labels) > 30:
            break

    # Amundi affiche parfois une catégorie à 0 % sans chiffre à côté.
    if len(labels) == len(values) + 1 and labels[-1] == "Autres pays":
        labels.pop()
    if heading is HEADINGS["secteurs"] and len(labels) > len(values) and 99 <= sum(values) <= 101:
        labels = labels[:len(values)]

    total = round(sum(values), 2)
    if len(values) != len(labels) or not 99 <= total <= 101:
        return {"status": "à vérifier", "valeurs": values, "libellés": labels, "total": total}
    return {"status": "extrait", "répartition": dict(zip(labels, values)), "total": total}


def audit_one(etf):
    isin = etf["isin"]
    errors = []
    for profile in ("RETAIL", "INSTITUTIONNEL"):
        url = REPORT_BASE.format(isin=isin, profile=profile)
        try:
            request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urlopen(request, timeout=35) as response:
                pdf = response.read()
            if not pdf.startswith(b"%PDF-"):
                raise ValueError("la réponse n'est pas un PDF")
            text = subprocess.run(
                ["pdftotext", "-raw", "-", "-"], input=pdf,
                capture_output=True, check=True,
            ).stdout.decode("utf-8").replace("\f", "\n")
            if isin not in text:
                raise ValueError("ISIN absent du PDF")
            date_match = re.search(r"\b\d{2}/\d{2}/20\d{2}\b", text)
            date = datetime.strptime(date_match.group(), "%d/%m/%Y").date().isoformat() if date_match else None
            return {
                "isin": isin, "nom": etf["nom"], "reporting_date": date,
                "reporting_url": url,
                **{key: extract_chart(text, heading) for key, heading in HEADINGS.items()},
            }
        except (HTTPError, URLError, TimeoutError, ValueError, subprocess.CalledProcessError) as exc:
            errors.append(f"{profile}: {exc}")
    return {"isin": isin, "nom": etf["nom"], "status": "reporting inaccessible", "erreurs": errors}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--all", action="store_true", help="auditer aussi les ETF déjà présents dans mvp-profiles.json")
    parser.add_argument("--output", type=Path, default=Path("/tmp/etf-composition-audit.json"))
    args = parser.parse_args()
    catalog = json.loads(CATALOG.read_text())["etf"]
    covered = {item["isin"] for item in json.loads(PROFILES.read_text())["etfs"]}
    selected = catalog if args.all else [item for item in catalog if item["isin"] not in covered]
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(audit_one, selected))
    args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n")
    for row in results:
        if "status" in row:
            state = row["status"]
        else:
            state = f"pays: {row['pays']['status']}, secteurs: {row['secteurs']['status']}"
        print(f"{row['isin']}  {state}")
    print(f"Audit écrit dans {args.output}")


if __name__ == "__main__":
    main()
