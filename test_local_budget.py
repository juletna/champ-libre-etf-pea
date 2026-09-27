import tempfile
import unittest
from pathlib import Path

from local_budget import DataError, activate_target, budget_state, save_project, save_settings, select_source
from local_data import save_item, snapshot
from local_server import connect, initialize


class BudgetTests(unittest.TestCase):
    def test_reserves_monthly_capacity_and_targets_leave_assets_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'db.sqlite'
            initialize(path)
            db = connect(path)
            try:
                common = {"kind": "actif", "status": "actuel", "usage": "libre", "day": "2026-01-01"}
                cash = save_item(db, {**common, "category": "Liquidités", "label": "Compte", "owner": "conjoint_1", "asset_class": "liquidite", "value_eur": "4000"})
                save_item(db, {**common, "category": "Immobilier", "label": "Maison", "owner": "commun", "asset_class": "immobilier", "value_eur": "100000"})
                child = save_item(db, {**common, "category": "Liquidités", "label": "Enfant", "owner": "enfants", "asset_class": "liquidite", "value_eur": "5000"})
                select_source(db, cash, True)
                with self.assertRaises(DataError):
                    select_source(db, child, True)
                save_project(db, {"label": "Travaux", "kind": "projet", "amount_eur": "1000", "due_on": "2027-01-01", "funding_item_id": cash})
                state = budget_state(db, "2026-01-01")
                self.assertEqual((state["financial_eur"], state["max_oneoff_eur"]), (4000, 3000))
                before = snapshot(db, "2026-01-01")
                saved = save_settings(db, {"monthly_eur": "500", "chosen_deposit_eur": "3000", "horizon_years": 10, "risk": "equilibre"})
                self.assertEqual(saved["settings"]["monthly_eur"], 500)
                with self.assertRaises(DataError):
                    save_settings(db, {"monthly_eur": "500", "chosen_deposit_eur": "3500", "horizon_years": 10, "risk": "equilibre"})
                first = activate_target(db, {"name": "Monde", "weights": {"FR0000000001": 100}, "source": "panier fictif"})
                second = activate_target(db, {"name": "Mixte", "weights": {"FR0000000001": 60, "FR0000000002": 40}, "source": "panier fictif"})
                self.assertEqual((first["targets"][0]["version"], second["targets"][0]["version"]), (1, 2))
                self.assertEqual(sum(target["active"] for target in second["targets"]), 1)
                self.assertEqual(snapshot(db, "2026-01-01"), before)
            finally:
                db.close()


if __name__ == '__main__':
    unittest.main()
