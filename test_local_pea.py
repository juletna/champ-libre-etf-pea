import tempfile
import unittest
from pathlib import Path

from local_data import DataError, save_item, snapshot
from local_pea import account_state, apply_statement, link_aggregate, preview_statement, undo_latest
from local_server import connect, initialize


def statement(text, when, mode="complete", cash="10"):
    return preview_statement({"text": text, "delimiter": ";", "columns": {"isin": "ISIN", "label": "Libellé", "quantity": "Quantité", "value": "Valorisation"}, "as_of": when, "mode": mode, "cash_eur": cash})


class PeaTests(unittest.TestCase):
    def test_internal_transfer_and_purchase_conserve_household_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "db.sqlite"
            initialize(path)
            db = connect(path)
            try:
                common = {"kind": "actif", "owner": "conjoint_1", "status": "actuel", "usage": "libre"}
                cash = save_item(db, {**common, "category": "Banque", "label": "Espèces", "asset_class": "liquidite", "day": "2026-01-01", "value_eur": "500"})
                aggregate = save_item(db, {**common, "category": "PEA", "label": "Ancien total", "asset_class": "titre", "day": "2026-01-01", "value_eur": "100"})
                initial = statement("ISIN;Libellé;Quantité;Valorisation\nFR0000000001;Fonds;9;90\n", "2026-01-01", cash="10")
                apply_statement(db, initial)
                link_aggregate(db, aggregate, "2026-01-01")
                self.assertEqual(snapshot(db, "2026-01-01")["assets_eur"], 600)
                save_item(db, {**common, "id": cash, "category": "Banque", "label": "Espèces", "asset_class": "liquidite", "day": "2026-02-01", "value_eur": "450"})
                transferred = statement("ISIN;Libellé;Quantité;Valorisation\nFR0000000001;Fonds;9;90\n", "2026-02-01", cash="60")
                apply_statement(db, transferred)
                self.assertEqual(snapshot(db, "2026-02-01")["assets_eur"], 600)
                bought = statement("ISIN;Libellé;Quantité;Valorisation\nFR0000000001;Fonds;13;130\n", "2026-02-01", cash="20")
                apply_statement(db, bought)
                self.assertEqual(snapshot(db, "2026-02-01")["assets_eur"], 600)
                self.assertTrue(apply_statement(db, bought)["duplicate"])
            finally:
                db.close()

    def test_statements_are_idempotent_partial_and_undoable_without_double_counting(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "db.sqlite"
            initialize(path)
            db = connect(path)
            try:
                aggregate = save_item(db, {"kind": "actif", "category": "Placements", "label": "Ancien PEA", "owner": "conjoint_1", "status": "actuel", "usage": "libre", "asset_class": "inconnu", "day": "2026-01-01", "value_eur": "1000"})
                first = statement("ISIN;Libellé;Quantité;Valorisation\nFR0000000001;Fonds;2,5;1 000,00\nZZ0000000002;Inconnu;;50,00\n", "2026-02-01")
                self.assertEqual(first["incomplete"], 1)
                created = apply_statement(db, first)
                self.assertEqual(created["total_eur"], 1060)
                self.assertTrue(apply_statement(db, first)["duplicate"])
                self.assertEqual(len(account_state(db)["imports"]), 1)
                self.assertEqual(snapshot(db, "2026-02-01")["assets_eur"], 1000)
                difference = link_aggregate(db, aggregate, "2026-02-01")
                self.assertEqual(difference["difference_eur"], 60)
                self.assertEqual(snapshot(db, "2026-01-15")["assets_eur"], 1000)
                self.assertEqual(snapshot(db, "2026-02-01")["assets_eur"], 1060)
                linked = next(item for item in snapshot(db, "2026-02-01")["items"] if item["id"] == aggregate)
                self.assertEqual((linked["day"], linked["verified_on"]), ("2026-02-01", "2026-02-01"))
                partial = statement("ISIN;Libellé;Quantité;Valorisation\nFR0000000001;Fonds;3;1200\n", "2026-03-01", "partial", "")
                updated = apply_statement(db, partial)
                self.assertEqual(updated["total_eur"], 1260)
                self.assertEqual(len(updated["positions"]), 2)
                self.assertEqual(snapshot(db, "2026-02-15")["assets_eur"], 1060)
                later = next(item for item in snapshot(db, "2026-03-01")["items"] if item["id"] == aggregate)
                self.assertEqual((later["day"], later["verified_on"]), ("2026-03-01", "2026-03-01"))
                latest = updated["imports"][0]["id"]
                restored = undo_latest(db, latest)
                self.assertEqual(restored["total_eur"], 1060)
                complete = statement("ISIN;Libellé;Quantité;Valorisation\nFR0000000001;Fonds;3;1200\n", "2026-03-01", "complete", "10")
                replaced = apply_statement(db, complete)
                self.assertEqual((replaced["total_eur"], len(replaced["positions"])), (1210, 1))
                self.assertEqual(snapshot(db, "2026-03-01")["assets_eur"], 1210)
            finally:
                db.close()

    def test_ambiguous_numbers_and_incoherent_rows_are_rejected(self):
        with self.assertRaises(DataError):
            statement("ISIN;Libellé;Quantité;Valorisation\nFR0000000001;Fonds;2;1.000\n", "2026-02-01")
        with self.assertRaises(DataError):
            statement("ISIN;Libellé;Quantité;Valorisation\nFR0000000001;Fonds;2;100\nFR0000000001;Fonds;2;100\n", "2026-02-01")
        with self.assertRaises(DataError):
            statement("ISIN;Libellé;Quantité;Valorisation\nFR0000000001;Fonds;2;100\n", "2026-02-01", "complete", "")


if __name__ == "__main__":
    unittest.main()
