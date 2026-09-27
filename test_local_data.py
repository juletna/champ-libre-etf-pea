import json
import tempfile
import unittest
from pathlib import Path

from local_data import DataError, household, import_legacy, preview_legacy, save_item, save_items, snapshot
from local_server import connect, initialize


CSV = """date;type;categorie;poste;valeur_eur;verifie_le;echeancier_id;propriete;statut;usage
2026-01-01;actif;Immobilier;Maison;100000;2026-01-01;;commun;actuel;libre
2026-01-01;actif;Liquidités;Compte;5000;2026-01-01;;conjoint_1;actuel;reserve
2026-02-01;actif;Liquidités;Compte;4000;2026-02-01;;conjoint_1;actuel;reserve
2026-01-01;actif;Placements;Enfant;1000;2026-01-01;;enfants;actuel;libre
2026-01-01;actif;Projet;Héritage;10000;2026-01-01;;non_precise;previsionnel;libre
2026-01-01;passif;Crédit;Maison;;2026-01-01;pret;commun;actuel;libre
"""
SCHEDULE = """date_echeance;capital_avant;capital_rembourse;interets;assurance;echeance;capital_apres
2026-02-05;50000;1000;100;10;1110;49000
2026-03-05;49000;48806.16;100;10;48916.16;193.84
"""
CREDIT = json.dumps({"id": "pret", "label": "Crédit maison", "effective_from": "2026-01-01", "source": "fictif"})


class HouseholdTests(unittest.TestCase):
    def test_legacy_totals_schedule_history_and_stable_rename(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "champ-libre.sqlite"
            initialize(path)
            parsed = preview_legacy(CSV, SCHEDULE, CREDIT)
            self.assertEqual(parsed["report"]["items"], 5)
            with connect(path) as db:
                import_legacy(db, parsed)
                before = snapshot(db, "2026-01-15")
                self.assertEqual((before["assets_eur"], before["debts_eur"], before["net_eur"]), (105000, 50000, 55000))
                after = snapshot(db, "2026-02-06")
                self.assertEqual((after["assets_eur"], after["debts_eur"], after["net_eur"]), (104000, 49000, 55000))
                self.assertEqual(snapshot(db, "2026-04-01")["debts_eur"], 193.84)
                self.assertEqual(len(after["items"]), 5)
                cash = next(item for item in after["items"] if item["label"] == "Compte")
                save_item(db, {"id": cash["id"], "kind": "actif", "category": "Liquidités", "label": "Compte renommé", "owner": "conjoint_1", "status": "actuel", "usage": "reserve", "asset_class": "liquidite", "day": "2026-02-01", "verified_on": "2026-02-01", "value_eur": 4000})
                self.assertEqual(snapshot(db, "2026-01-15")["assets_eur"], 105000)
                self.assertEqual(len(household(db)["snapshot"]["items"]), 5)
                with self.assertRaises(DataError):
                    import_legacy(db, parsed)

    def test_invalid_schedule_does_not_import(self):
        with self.assertRaises(DataError):
            preview_legacy(CSV, SCHEDULE.replace("49000;48806.16", "48000;48806.16"), CREDIT)

    def test_linked_debt_requires_companion_files(self):
        with self.assertRaisesRegex(DataError, r"amortissement\.csv et credit\.json"):
            preview_legacy(CSV)

    def test_table_save_is_atomic_and_keeps_unchanged_valuation_source(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "champ-libre.sqlite"
            initialize(path)
            with connect(path) as db:
                import_legacy(db, preview_legacy(CSV, SCHEDULE, CREDIT))
                cash = next(item for item in snapshot(db, "2026-02-06")["items"] if item["label"] == "Compte")
                values = {key: cash[key] for key in ("id", "kind", "category", "label", "owner", "status", "usage", "asset_class", "schedule_id", "account_id", "day", "verified_on", "value_eur")}
                values["category"] = "Épargne disponible"
                save_items(db, [values])
                source = db.execute("SELECT source,original_json FROM valuations WHERE item_id=? AND day=?", (cash["id"], cash["day"])).fetchone()
                self.assertEqual(source["source"], "patrimoine.csv")
                self.assertIsNotNone(source["original_json"])
                count = db.execute("SELECT COUNT(*) FROM items").fetchone()[0]
                new = {**values, "label": "Nouveau poste", "category": "Liquidités", "day": "2026-02-06"}
                new.pop("id")
                with self.assertRaises(DataError):
                    save_items(db, [new, {**new, "label": ""}])
                self.assertEqual(db.execute("SELECT COUNT(*) FROM items").fetchone()[0], count)
                self.assertEqual(len(save_items(db, [new])), 1)
                self.assertEqual(db.execute("SELECT COUNT(*) FROM items").fetchone()[0], count + 1)


if __name__ == "__main__":
    unittest.main()
