import tempfile
import unittest
from pathlib import Path

from local_data import DataError, household, save_item, save_items, schedule_detail, snapshot
from local_server import connect, initialize


def seed_household(db):
    db.execute("INSERT INTO schedules VALUES (?,?,?)", ("pret", "Crédit maison", '{"effective_from":"2026-01-01"}'))
    db.executemany("INSERT INTO schedule_rows VALUES (?,?,?,?,?,?,?,?)", [
        ("pret", "2026-02-05", 5000000, 100000, 10000, 1000, 111000, 4900000),
        ("pret", "2026-03-05", 4900000, 4880616, 10000, 1000, 4891616, 19384),
    ])
    def item(label, category, value, owner="commun", status="actuel", kind="actif", usage="libre", schedule_id=None):
        return save_item(db, {"kind": kind, "category": category, "label": label, "owner": owner,
                              "status": status, "usage": usage, "asset_class": "inconnu", "day": "2026-01-01",
                              "verified_on": "2026-01-01", "value_eur": value, "schedule_id": schedule_id})
    item("Maison", "Immobilier", 100000)
    cash_id = item("Compte", "Liquidités", 5000, "conjoint_1", usage="reserve")
    save_item(db, {"id": cash_id, "kind": "actif", "category": "Liquidités", "label": "Compte", "owner": "conjoint_1",
                   "status": "actuel", "usage": "reserve", "asset_class": "inconnu", "day": "2026-02-01",
                   "verified_on": "2026-02-01", "value_eur": 4000})
    item("Enfant", "Placements", 1000, "enfants")
    item("Héritage", "Projet", 10000, "non_precise", "previsionnel")
    item("Maison", "Crédit", None, kind="passif", schedule_id="pret")


class HouseholdTests(unittest.TestCase):
    def test_totals_schedule_history_and_stable_rename(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "champ-libre.sqlite"
            initialize(path)
            with connect(path) as db:
                seed_household(db)
                before = snapshot(db, "2026-01-15")
                self.assertEqual((before["assets_eur"], before["debts_eur"], before["net_eur"]), (105000, 50000, 55000))
                after = snapshot(db, "2026-02-06")
                self.assertEqual((after["assets_eur"], after["debts_eur"], after["net_eur"]), (104000, 49000, 55000))
                self.assertEqual(snapshot(db, "2026-04-01")["debts_eur"], 193.84)
                detail = schedule_detail(db, "pret")
                self.assertEqual(len(detail["rows"]), 2)
                self.assertEqual(detail["rows"][0]["payment_eur"], 1110)
                self.assertEqual(detail["rows"][-1]["after_eur"], 193.84)
                self.assertEqual(len(after["items"]), 5)
                cash = next(item for item in after["items"] if item["label"] == "Compte")
                save_item(db, {"id": cash["id"], "kind": "actif", "category": "Liquidités", "label": "Compte renommé", "owner": "conjoint_1", "status": "actuel", "usage": "reserve", "asset_class": "liquidite", "day": "2026-02-01", "verified_on": "2026-02-01", "value_eur": 4000})
                self.assertEqual(snapshot(db, "2026-01-15")["assets_eur"], 105000)
                self.assertEqual(len(household(db)["snapshot"]["items"]), 5)

    def test_table_save_is_atomic_and_keeps_unchanged_valuation_source(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "champ-libre.sqlite"
            initialize(path)
            with connect(path) as db:
                seed_household(db)
                cash = next(item for item in snapshot(db, "2026-02-06")["items"] if item["label"] == "Compte")
                values = {key: cash[key] for key in ("id", "kind", "category", "label", "owner", "status", "usage", "asset_class", "schedule_id", "account_id", "day", "verified_on", "value_eur")}
                values["category"] = "Épargne disponible"
                save_items(db, [values])
                source = db.execute("SELECT source,original_json FROM valuations WHERE item_id=? AND day=?", (cash["id"], cash["day"])).fetchone()
                self.assertEqual(source["source"], "saisie manuelle")
                self.assertIsNone(source["original_json"])
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
