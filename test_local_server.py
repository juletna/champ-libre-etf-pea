import json
import sqlite3
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path

from local_server import DataError, Handler, backup_bytes, workspace_data, initialize, put_workspace_data, restore_database
from local_server import connect
from local_data import save_item, snapshot
from local_pea import apply_statement, link_aggregate, preview_statement


class StorageTests(unittest.TestCase):
    def test_schema_upgrade_keeps_previous_version_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "champ-libre.sqlite"
            with sqlite3.connect(path) as db:
                db.execute("CREATE TABLE browser_data(key TEXT PRIMARY KEY,value TEXT NOT NULL)")
                db.execute("INSERT INTO browser_data VALUES (?,?)", ("champ-libre.workspace.v1", json.dumps({"version": 1, "current": {}, "baskets": []})))
                db.execute("PRAGMA user_version=1")
            initialize(path)
            backups = list(Path(directory).glob("champ-libre-before-v1-*.sqlite"))
            self.assertEqual(len(backups), 1)
            with sqlite3.connect(backups[0]) as original:
                self.assertEqual(original.execute("PRAGMA user_version").fetchone()[0], 1)
                self.assertEqual(original.execute("SELECT COUNT(*) FROM browser_data").fetchone()[0], 1)
            with connect(path) as upgraded:
                self.assertEqual(upgraded.execute("PRAGMA user_version").fetchone()[0], 4)

    def test_restart_backup_restore_and_invalid_file(self):
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / "first" / "champ-libre.sqlite"
            second = Path(directory) / "second" / "champ-libre.sqlite"
            initialize(first)
            workspace = json.dumps({"version": 1, "current": {"weights": {"A": 100}}, "baskets": [{"id": "one", "name": "Test", "snapshot": {"weights": {"A": 100}}}], "activeId": "one"})
            migration = json.dumps({"version": 1, "data": {"holdings": {"A": 30}, "cash": 10}})
            data = {"version": 1, "entries": {"champ-libre.workspace.v1": workspace, "champ-libre.migration.v1": migration}}
            put_workspace_data(first, {"version": 1, "entries": {"champ-libre.workspace.v1": workspace}})
            with connect(first) as db:
                db.execute("INSERT INTO browser_data VALUES (?,?)", ("champ-libre.migration.v1", migration))
            initialize(first)
            self.assertEqual(workspace_data(first), data["entries"])
            saved = backup_bytes(first)
            initialize(second)
            put_workspace_data(second, {"version": 1, "entries": {"champ-libre.workspace.v1": json.dumps({"version": 1, "current": {}, "baskets": []})}})
            before = workspace_data(second)
            with self.assertRaises(DataError):
                restore_database(second, b"not sqlite")
            self.assertEqual(workspace_data(second), before)
            previous = restore_database(second, saved)
            self.assertTrue(previous.exists())
            initialize(second)
            self.assertEqual(workspace_data(second), data["entries"])

    def test_workspace_validation_is_atomic_and_rejects_legacy_keys(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "champ-libre.sqlite"
            initialize(path)
            with self.assertRaises(DataError):
                put_workspace_data(path, {"version": 1, "entries": {"champ-libre.workspace.v1": "{}"}})
            with self.assertRaises(DataError):
                put_workspace_data(path, {"version": 1, "entries": {"champ-libre.migration.v1": '{"version":1,"data":{}}'}})
            self.assertEqual(workspace_data(path), {})

    def test_http_origin_and_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "champ-libre.sqlite"
            initialize(path)
            server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
            server.db_path = path
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                port = server.server_port
                connection = HTTPConnection("127.0.0.1", port)
                body = json.dumps({"version": 1, "entries": {"champ-libre.workspace.v1": json.dumps({"version": 1, "current": {}, "baskets": []})}})
                connection.request("PUT", "/api/workspace", body, {"Content-Type": "application/json", "Origin": "https://other.example", "X-Champ-Local": "1"})
                self.assertEqual(connection.getresponse().status, 403)
                connection.request("PUT", "/api/workspace", body, {"Content-Type": "application/json", "Origin": f"http://127.0.0.1:{port}", "X-Champ-Local": "1"})
                self.assertEqual(connection.getresponse().status, 200)
                connection.request("GET", "/api/backup.sqlite", headers={"X-Champ-Local": "1"})
                backup = connection.getresponse()
                self.assertEqual(backup.status, 200)
                self.assertTrue(backup.read().startswith(b"SQLite format 3\x00"))
                item = {"id": "test-inline-row", "day": "2026-01-01", "kind": "actif", "category": "Liquidités", "label": "Compte fictif", "value_eur": "100", "owner": "non_precise", "status": "actuel", "usage": "libre", "asset_class": "liquidite", "verified_on": "2026-01-01"}
                headers = {"Content-Type": "application/json", "Origin": f"http://127.0.0.1:{port}", "X-Champ-Local": "1"}
                connection.request("POST", "/api/items", json.dumps({"items": [item]}), headers)
                response = connection.getresponse()
                self.assertEqual(response.status, 200)
                self.assertEqual(json.loads(response.read())["ids"], [item["id"]])
                connection.request("POST", "/api/items", json.dumps({"items": [item]}), headers)
                response = connection.getresponse()
                self.assertEqual(response.status, 200)
                response.read()
                connection.request("GET", "/api/household")
                self.assertEqual(len(json.loads(connection.getresponse().read())["snapshot"]["items"]), 1)
                connection.close()
            finally:
                server.shutdown()
                server.server_close()
                thread.join()

    def test_backup_restores_household_and_linked_pea(self):
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / 'first.sqlite'
            second = Path(directory) / 'second.sqlite'
            initialize(first)
            with connect(first) as db:
                item_id = save_item(db, {"kind": "actif", "category": "Placements", "label": "PEA ancien", "owner": "conjoint_1", "status": "actuel", "usage": "libre", "asset_class": "inconnu", "day": "2026-01-01", "value_eur": "100"})
                parsed = preview_statement({"text": "ISIN;Valeur\nFR0000000001;110\n", "delimiter": ";", "columns": {"isin": "ISIN", "value": "Valeur"}, "as_of": "2026-02-01", "mode": "complete", "cash_eur": "10"})
                apply_statement(db, parsed)
                link_aggregate(db, item_id, "2026-02-01")
                before = snapshot(db, "2026-03-01")
            self.assertEqual(before["assets_eur"], 120)
            saved = backup_bytes(first)
            initialize(second)
            restore_database(second, saved)
            with connect(second) as db:
                self.assertEqual(snapshot(db, "2026-03-01"), before)
            with self.assertRaises(DataError):
                restore_database(second, b"broken")
            with connect(second) as db:
                self.assertEqual(snapshot(db, "2026-03-01"), before)

    def test_http_pea_preview_import_duplicate_and_reject(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'db.sqlite'
            initialize(path)
            server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
            server.db_path = path
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            connection = HTTPConnection('127.0.0.1', server.server_port)
            headers = {'Content-Type': 'application/json', 'Origin': f'http://127.0.0.1:{server.server_port}', 'X-Champ-Local': '1'}
            payload = {'text': 'ISIN;Valeur\nFR0000000001;100\n', 'delimiter': ';', 'columns': {'isin': 'ISIN', 'value': 'Valeur'}, 'as_of': '2026-02-01', 'mode': 'complete', 'cash_eur': '10'}
            try:
                connection.request('POST', '/api/pea-preview', json.dumps(payload), headers)
                response = connection.getresponse()
                self.assertEqual(response.status, 200)
                self.assertEqual(json.loads(response.read())['total_eur'], 110)
                connection.request('POST', '/api/pea-import', json.dumps(payload), headers)
                response = connection.getresponse()
                self.assertEqual(response.status, 200)
                self.assertFalse(json.loads(response.read())['duplicate'])
                connection.request('POST', '/api/pea-import', json.dumps(payload), headers)
                self.assertTrue(json.loads(connection.getresponse().read())['duplicate'])
                payload['text'] = 'ISIN;Valeur\nFR0000000001;1.000\n'
                connection.request('POST', '/api/pea-import', json.dumps(payload), headers)
                self.assertEqual(connection.getresponse().status, 400)
                connection.request('GET', '/api/pea')
                self.assertEqual(json.loads(connection.getresponse().read())['total_eur'], 110)
            finally:
                connection.close()
                server.shutdown()
                server.server_close()
                thread.join()


if __name__ == "__main__":
    unittest.main()
