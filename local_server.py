#!/usr/bin/env python3
"""Local, single-computer storage and production UI for Champ libre."""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import tempfile
import threading
import webbrowser
from contextlib import closing
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from local_data import DataError, household, import_legacy, migrate_v2, preview_legacy, save_item, save_items
from local_pea import account_state, apply_statement, include_without_aggregate, link_aggregate, migrate_v3, preview_statement, undo_latest, update_account
from local_budget import activate_target, budget_state, migrate_v4, save_account, save_project, save_settings, select_source

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "app" / "dist"
SCHEMA_VERSION = 4
KEYS = {"champ-libre.workspace.v1", "champ-libre.migration.v1", "champ-libre.allocation-models.v1"}
LOCK = threading.RLock()


def default_data_dir() -> Path:
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
        return base / "ChampLibre"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "ChampLibre"
    return Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share") / "champ-libre"


def connect(path: Path) -> sqlite3.Connection:
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def initialize(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with closing(connect(path)) as db:
        version = db.execute("PRAGMA user_version").fetchone()[0]
        if version > SCHEMA_VERSION:
            raise DataError(f"Base de version {version} plus récente que ce logiciel.")
        if 0 < version < SCHEMA_VERSION:
            fd, saved_name = tempfile.mkstemp(prefix=f"champ-libre-before-v{version}-", suffix=".sqlite", dir=path.parent)
            with os.fdopen(fd, "wb") as saved:
                saved.write(backup_bytes(path))
                saved.flush()
                os.fsync(saved.fileno())
        if version == 0:
            with db:
                db.execute("CREATE TABLE IF NOT EXISTS browser_data (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
                db.execute("PRAGMA user_version = 1")
            version = 1
        if version == 1:
            migrate_v2(db)
            version = 2
        if version == 2:
            migrate_v3(db)
            version = 3
        if version == 3:
            migrate_v4(db)
        if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise DataError("Base SQLite corrompue.")


def validate_browser_data(value: object) -> dict[str, str]:
    if not isinstance(value, dict) or value.get("version") != 1 or not isinstance(value.get("entries"), dict):
        raise DataError("Format d'import navigateur invalide.")
    entries = value["entries"]
    if not entries.keys() <= KEYS:
        raise DataError("Clé de stockage inconnue.")
    for key, raw in entries.items():
        if not isinstance(raw, str) or len(raw) > 2_000_000:
            raise DataError(f"Valeur invalide pour {key}.")
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise DataError(f"JSON invalide pour {key}.") from exc
        if not isinstance(parsed, dict) or parsed.get("version") != 1:
            raise DataError(f"Version invalide pour {key}.")
        if key.endswith("workspace.v1") and (not isinstance(parsed.get("baskets"), list) or not isinstance(parsed.get("current"), dict)):
            raise DataError("Espace de travail invalide.")
        if key.endswith("migration.v1") and not isinstance(parsed.get("data"), dict):
            raise DataError("Portefeuille réel invalide.")
        if key.endswith("allocation-models.v1") and not isinstance(parsed.get("models"), list):
            raise DataError("Anciens modèles invalides.")
    return entries


def browser_data(db_path: Path) -> dict[str, str]:
    with closing(connect(db_path)) as db:
        return {row["key"]: row["value"] for row in db.execute("SELECT key, value FROM browser_data")}


def put_browser_data(db_path: Path, value: object, replace: bool = False) -> None:
    entries = validate_browser_data(value)
    with closing(connect(db_path)) as db, db:
        if replace:
            db.execute("DELETE FROM browser_data")
        db.executemany("INSERT INTO browser_data(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", entries.items())


def backup_bytes(db_path: Path) -> bytes:
    with tempfile.TemporaryDirectory(prefix="champ-libre-backup-") as directory:
        destination = Path(directory) / "backup.sqlite"
        with closing(connect(db_path)) as source, closing(connect(destination)) as target:
            source.backup(target)
        return destination.read_bytes()


def validate_database(path: Path) -> None:
    uri = path.resolve().as_uri() + "?mode=ro"
    try:
        db = sqlite3.connect(uri, uri=True)
    except sqlite3.DatabaseError as exc:
        raise DataError("Fichier SQLite invalide.") from exc
    try:
        if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise DataError("La sauvegarde SQLite est corrompue.")
        if db.execute("PRAGMA foreign_key_check").fetchone():
            raise DataError("La sauvegarde contient des références manquantes.")
        version = db.execute("PRAGMA user_version").fetchone()[0]
        if version not in (1, 2, 3, SCHEMA_VERSION):
            raise DataError("Version de sauvegarde incompatible.")
        columns = {row[1] for row in db.execute("PRAGMA table_info(browser_data)")}
        if columns != {"key", "value"}:
            raise DataError("Schéma de sauvegarde invalide.")
        if version >= 2:
            for table in ("items", "valuations", "schedules", "schedule_rows"):
                if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone():
                    raise DataError("Schéma patrimonial incomplet.")
        if version >= 3:
            for table in ("pea_accounts", "pea_positions", "pea_imports"):
                if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone():
                    raise DataError("Schéma PEA incomplet.")
        if version >= 4:
            for table in ("accounts", "projects", "funding_choices", "budget_settings", "investment_targets"):
                if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone():
                    raise DataError("Schéma de budget incomplet.")
        if db.execute("SELECT 1 FROM sqlite_master WHERE type IN ('trigger','view') LIMIT 1").fetchone():
            raise DataError("Schéma de sauvegarde inattendu.")
        validate_browser_data({"version": 1, "entries": {key: value for key, value in db.execute("SELECT key, value FROM browser_data")}})
    except sqlite3.DatabaseError as exc:
        raise DataError("Fichier SQLite invalide.") from exc
    finally:
        db.close()


def restore_database(db_path: Path, raw: bytes) -> Path:
    if len(raw) < 100 or len(raw) > 100_000_000 or not raw.startswith(b"SQLite format 3\x00"):
        raise DataError("Fichier SQLite invalide ou trop volumineux.")
    fd, candidate_name = tempfile.mkstemp(prefix=".champ-libre-restore-", suffix=".sqlite", dir=db_path.parent)
    candidate = Path(candidate_name)
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(raw)
            output.flush()
            os.fsync(output.fileno())
        validate_database(candidate)
        initialize(candidate)
        validate_database(candidate)
        fd, previous_name = tempfile.mkstemp(prefix="champ-libre-before-restore-", suffix=".sqlite", dir=db_path.parent)
        os.close(fd)
        previous = Path(previous_name)
        try:
            previous.write_bytes(backup_bytes(db_path))
            with previous.open("rb") as saved:
                os.fsync(saved.fileno())
            os.replace(candidate, db_path)
            return previous
        except Exception:
            previous.unlink(missing_ok=True)
            raise
    finally:
        candidate.unlink(missing_ok=True)


class Handler(BaseHTTPRequestHandler):
    def respond(self, status: HTTPStatus, raw: bytes, content_type: str, filename: str = "") -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        if filename:
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.end_headers()
        self.wfile.write(raw)

    def json(self, status: HTTPStatus, data: object) -> None:
        self.respond(status, json.dumps(data, ensure_ascii=False).encode(), "application/json; charset=utf-8")

    def allowed(self, write: bool = False) -> bool:
        origin = f"http://127.0.0.1:{self.server.server_port}"
        if self.headers.get("Host") != f"127.0.0.1:{self.server.server_port}":
            return False
        return not write or (self.headers.get("Origin") == origin and self.headers.get("X-Champ-Local") == "1")

    def do_GET(self) -> None:
        if not self.allowed():
            self.json(HTTPStatus.FORBIDDEN, {"error": "Accès local uniquement."})
            return
        path = urlsplit(self.path).path
        if path.startswith("/api/"):
            if path == "/api/health":
                self.json(HTTPStatus.OK, {"local": True, "schema": SCHEMA_VERSION})
            elif path == "/api/browser-data":
                with LOCK:
                    self.json(HTTPStatus.OK, {"version": 1, "entries": browser_data(self.server.db_path)})
            elif path == "/api/export.json":
                with LOCK:
                    with closing(connect(self.server.db_path)) as db:
                        tables = ("browser_data", "items", "valuations", "schedules", "schedule_rows", "pea_accounts", "pea_positions", "pea_imports", "accounts", "projects", "funding_choices", "budget_settings", "investment_targets")
                        content = {table: [dict(row) for row in db.execute(f"SELECT * FROM {table}")] for table in tables}
                    raw = json.dumps({"format": "champ-libre-json-export", "version": 1, "schema_version": SCHEMA_VERSION, "tables": content}, ensure_ascii=False, indent=2).encode()
                self.respond(HTTPStatus.OK, raw, "application/json; charset=utf-8", "champ-libre-export.json")
            elif path == "/api/backup.sqlite":
                if self.headers.get("X-Champ-Local") != "1":
                    self.json(HTTPStatus.FORBIDDEN, {"error": "En-tête local requis."})
                    return
                with LOCK:
                    raw = backup_bytes(self.server.db_path)
                self.respond(HTTPStatus.OK, raw, "application/vnd.sqlite3", "champ-libre-backup.sqlite")
            elif path == "/api/household":
                requested = parse_qs(urlsplit(self.path).query).get("day", [None])[0]
                try:
                    with LOCK, closing(connect(self.server.db_path)) as db:
                        self.json(HTTPStatus.OK, household(db, requested))
                except DataError as exc:
                    self.json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            elif path == "/api/pea":
                with LOCK, closing(connect(self.server.db_path)) as db:
                    self.json(HTTPStatus.OK, account_state(db))
            elif path == "/api/budget":
                with LOCK, closing(connect(self.server.db_path)) as db:
                    self.json(HTTPStatus.OK, budget_state(db))
            else:
                self.json(HTTPStatus.NOT_FOUND, {"error": "API inconnue."})
            return
        relative = path.lstrip("/") or "index.html"
        file = (DIST / relative).resolve()
        if not file.is_relative_to(DIST.resolve()) or not file.is_file():
            self.json(HTTPStatus.NOT_FOUND, {"error": "Fichier introuvable. Exécutez npm run build dans app/."})
            return
        suffix = file.suffix.lower()
        kind = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json"}.get(suffix, "application/octet-stream")
        self.respond(HTTPStatus.OK, file.read_bytes(), kind)

    def do_PUT(self) -> None:
        self.write_request()

    def do_POST(self) -> None:
        self.write_request()

    def write_request(self) -> None:
        if not self.allowed(write=True):
            self.json(HTTPStatus.FORBIDDEN, {"error": "Écriture locale uniquement."})
            return
        path = urlsplit(self.path).path
        if path not in ("/api/browser-data", "/api/restore.sqlite", "/api/legacy-preview", "/api/legacy-import", "/api/item", "/api/items", "/api/pea-preview", "/api/pea-import", "/api/pea-undo", "/api/pea-link", "/api/pea-include", "/api/pea-browser-import", "/api/pea-account", "/api/account", "/api/project", "/api/funding", "/api/budget-settings", "/api/target"):
            self.json(HTTPStatus.NOT_FOUND, {"error": "API inconnue."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            maximum = 100_000_000 if path.endswith("sqlite") else 6_000_000
            if length <= 0 or length > maximum:
                raise DataError("Taille de requête invalide.")
            raw = self.rfile.read(length)
            if len(raw) != length:
                raise DataError("Requête incomplète.")
            if path.endswith("sqlite"):
                if self.headers.get_content_type() != "application/octet-stream":
                    raise DataError("Fichier SQLite attendu.")
                with LOCK:
                    previous = restore_database(self.server.db_path, raw)
                self.json(HTTPStatus.OK, {"restored": True, "previous_backup": previous.name})
            elif path in ("/api/legacy-preview", "/api/legacy-import", "/api/item", "/api/items", "/api/pea-preview", "/api/pea-import", "/api/pea-undo", "/api/pea-link", "/api/pea-include", "/api/pea-browser-import", "/api/pea-account", "/api/account", "/api/project", "/api/funding", "/api/budget-settings", "/api/target"):
                if self.headers.get_content_type() != "application/json":
                    raise DataError("JSON attendu.")
                value = json.loads(raw)
                if not isinstance(value, dict):
                    raise DataError("Objet JSON attendu.")
                if path == "/api/item":
                    with LOCK, closing(connect(self.server.db_path)) as db:
                        identifier = save_item(db, value)
                    self.json(HTTPStatus.OK, {"id": identifier})
                elif path == "/api/items":
                    with LOCK, closing(connect(self.server.db_path)) as db:
                        identifiers = save_items(db, value.get("items"))
                    self.json(HTTPStatus.OK, {"ids": identifiers})
                elif path in ("/api/account", "/api/project", "/api/funding", "/api/budget-settings", "/api/target"):
                    with LOCK, closing(connect(self.server.db_path)) as db:
                        if path == "/api/account":
                            result = {"id": save_account(db, value)}
                        elif path == "/api/project":
                            result = {"id": save_project(db, value)}
                        elif path == "/api/funding":
                            select_source(db, value.get("item_id"), value.get("selected"))
                            result = budget_state(db)
                        elif path == "/api/budget-settings":
                            result = save_settings(db, value)
                        else:
                            result = activate_target(db, value)
                    self.json(HTTPStatus.OK, result)
                elif path.startswith("/api/pea-"):
                    with LOCK, closing(connect(self.server.db_path)) as db:
                        if path == "/api/pea-preview":
                            result = preview_statement(value)
                        elif path == "/api/pea-import":
                            result = apply_statement(db, preview_statement(value))
                        elif path == "/api/pea-undo":
                            result = undo_latest(db, value.get("id"))
                        elif path == "/api/pea-link":
                            result = link_aggregate(db, value.get("item_id"), value.get("effective_from"))
                        elif path == "/api/pea-include":
                            include_without_aggregate(db, value.get("property_owner"))
                            result = account_state(db)
                        elif path == "/api/pea-account":
                            result = update_account(db, value.get("label"), value.get("holder"), value.get("property_owner"))
                        else:
                            raw_migration = browser_data(self.server.db_path).get("champ-libre.migration.v1")
                            if not raw_migration:
                                raise DataError("Ancien portefeuille navigateur absent.")
                            old = json.loads(raw_migration)
                            values = old.get("data", {})
                            as_of = value.get("as_of")
                            from local_data import cents, day
                            as_of = day(as_of)
                            rows = [{"isin": isin, "label": isin, "quantity": None, "value_cents": cents(amount), "price_cents": None, "valued_on": as_of} for isin, amount in values.get("holdings", {}).items()]
                            if account_state(db)["positions"]:
                                raise DataError("Un portefeuille PEA détaillé existe déjà.")
                            result = apply_statement(db, {"as_of": as_of, "mode": "complete", "cash_cents": cents(values.get("cash", 0)), "positions": rows}, "ancien navigateur")
                    self.json(HTTPStatus.OK, result)
                else:
                    if not isinstance(value.get("patrimoine_csv"), str) or not all(isinstance(value.get(key, ""), str) for key in ("amortissement_csv", "credit_json")):
                        raise DataError("Fichiers source invalides.")
                    parsed = preview_legacy(value["patrimoine_csv"], value.get("amortissement_csv", ""), value.get("credit_json", ""))
                    if path == "/api/legacy-preview":
                        self.json(HTTPStatus.OK, parsed["report"])
                    else:
                        with LOCK, closing(connect(self.server.db_path)) as db:
                            report = import_legacy(db, parsed)
                        self.json(HTTPStatus.OK, report)
            else:
                if self.headers.get_content_type() != "application/json":
                    raise DataError("JSON attendu.")
                value = json.loads(raw)
                validate_browser_data(value)
                with LOCK:
                    if self.command == "POST":
                        fd, previous_name = tempfile.mkstemp(prefix="champ-libre-before-import-", suffix=".sqlite", dir=self.server.db_path.parent)
                        with os.fdopen(fd, "wb") as previous_file:
                            previous_file.write(backup_bytes(self.server.db_path))
                            previous_file.flush()
                            os.fsync(previous_file.fileno())
                    put_browser_data(self.server.db_path, value, replace=self.command == "POST")
                self.json(HTTPStatus.OK, {"saved": True, "previous_backup": Path(previous_name).name if self.command == "POST" else None})
        except (DataError, ValueError, sqlite3.DatabaseError) as exc:
            self.json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})


def main() -> None:
    parser = argparse.ArgumentParser(description="Champ libre, application locale")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--data-dir", type=Path, default=default_data_dir())
    parser.add_argument("--open", action="store_true")
    args = parser.parse_args()
    db_path = args.data_dir.expanduser().resolve() / "champ-libre.sqlite"
    initialize(db_path)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    server.db_path = db_path
    print(f"Champ libre : http://127.0.0.1:{server.server_port}/", flush=True)
    print(f"Données : {db_path}", flush=True)
    if args.open:
        webbrowser.open(f"http://127.0.0.1:{server.server_port}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
