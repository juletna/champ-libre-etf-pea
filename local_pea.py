"""PEA statements: explicit snapshots, no inferred trades or performance."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import sqlite3
import uuid
from decimal import Decimal, InvalidOperation

from local_data import DataError, cents, day, euro


def migrate_v3(db: sqlite3.Connection) -> None:
    db.executescript("""
        BEGIN IMMEDIATE;
        CREATE TABLE pea_accounts (
            id TEXT PRIMARY KEY, label TEXT NOT NULL, holder TEXT NOT NULL,
            property_owner TEXT NOT NULL, cash_cents INTEGER NOT NULL DEFAULT 0,
            as_of TEXT, linked_item_id TEXT REFERENCES items(id), linked_from TEXT,
            include_in_household INTEGER NOT NULL DEFAULT 0
        );
        CREATE UNIQUE INDEX pea_one_link ON pea_accounts(linked_item_id) WHERE linked_item_id IS NOT NULL;
        CREATE TABLE pea_positions (
            account_id TEXT NOT NULL REFERENCES pea_accounts(id) ON DELETE CASCADE,
            isin TEXT NOT NULL, label TEXT NOT NULL, quantity TEXT,
            value_cents INTEGER NOT NULL, price_cents INTEGER, valued_on TEXT NOT NULL,
            PRIMARY KEY(account_id,isin)
        );
        CREATE TABLE pea_imports (
            id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES pea_accounts(id),
            as_of TEXT NOT NULL, mode TEXT NOT NULL, fingerprint TEXT NOT NULL UNIQUE,
            cash_cents INTEGER, before_json TEXT NOT NULL, after_json TEXT NOT NULL,
            source TEXT NOT NULL
        );
        PRAGMA user_version = 3;
        COMMIT;
    """)


def number(value: object, fractional: bool = False) -> Decimal:
    if not isinstance(value, (str, int, float)) or str(value).strip() == "":
        raise DataError("Nombre manquant.")
    raw = str(value).strip().replace("\u00a0", "").replace("\u202f", "").replace(" ", "")
    if raw.count(",") and raw.count("."):
        raise DataError("Nombre ambigu avec virgule et point.")
    if raw.count(",") > 1 or raw.count(".") > 1:
        raise DataError("Nombre ambigu.")
    if re.fullmatch(r"\d{1,3}([,.]\d{3})+", raw):
        raise DataError("Séparateur de milliers ambigu : retirez-le ou utilisez une espace.")
    try:
        result = Decimal(raw.replace(",", "."))
    except InvalidOperation as exc:
        raise DataError("Nombre invalide.") from exc
    if not result.is_finite() or result < 0 or result > Decimal("1000000000000") or result.as_tuple().exponent < (-8 if fractional else -2):
        raise DataError("Précision ou montant invalide.")
    return result


def parse_table(text: str, delimiter: str) -> tuple[list[str], list[list[str]]]:
    if delimiter not in (";", ",", "\t"):
        raise DataError("Séparateur invalide.")
    lines = list(csv.reader(io.StringIO(text.lstrip("\ufeff"), newline=""), delimiter=delimiter))
    if not lines or not lines[0] or len(lines[0]) > 50 or len(lines) > 5000:
        raise DataError("Tableau vide ou trop grand.")
    headers = [value.strip() for value in lines[0]]
    if any(not value for value in headers) or len(set(headers)) != len(headers):
        raise DataError("En-têtes vides ou dupliqués.")
    rows = [line for line in lines[1:] if any(value.strip() for value in line)]
    if any(len(line) != len(headers) for line in rows):
        raise DataError("Colonnes incohérentes : vérifiez le séparateur et les nombres.")
    return headers, rows


def preview_statement(value: dict) -> dict:
    if not isinstance(value, dict) or not isinstance(value.get("text"), str):
        raise DataError("Tableau manquant.")
    headers, rows = parse_table(value["text"], value.get("delimiter", ";"))
    columns = value.get("columns")
    if not isinstance(columns, dict) or columns.get("isin") not in headers or columns.get("value") not in headers:
        raise DataError("Choisissez les colonnes ISIN et valorisation.")
    for field in ("label", "quantity", "price"):
        if columns.get(field) and columns[field] not in headers:
            raise DataError(f"Colonne {field} inconnue.")
    used = [name for name in columns.values() if name]
    if len(used) != len(set(used)):
        raise DataError("Une colonne ne peut servir à deux champs.")
    mode = value.get("mode")
    if mode not in ("complete", "partial"):
        raise DataError("Choisissez relevé complet ou mise à jour partielle.")
    as_of = day(value.get("as_of"))
    cash = cents(value.get("cash_eur"), nullable=mode == "partial")
    if mode == "complete" and cash is None:
        raise DataError("Espèces requises pour un relevé complet.")
    parsed = []
    seen = set()
    for index, line in enumerate(rows, 2):
        row = dict(zip(headers, line))
        isin = row[columns["isin"]].strip().upper()
        if not re.fullmatch(r"[A-Z]{2}[A-Z0-9]{10}", isin):
            raise DataError(f"Ligne {index} : ISIN invalide.")
        if isin in seen:
            raise DataError(f"Ligne {index} : ISIN dupliqué.")
        seen.add(isin)
        try:
            amount = cents(row[columns["value"]])
            quantity = str(number(row[columns["quantity"]], fractional=True)) if columns.get("quantity") and row[columns["quantity"]].strip() else None
            price = cents(row[columns["price"]]) if columns.get("price") and row[columns["price"]].strip() else None
        except DataError as exc:
            raise DataError(f"Ligne {index} : {exc}") from exc
        label = row[columns["label"]].strip() if columns.get("label") else isin
        if not label or len(label) > 160:
            raise DataError(f"Ligne {index} : libellé invalide.")
        parsed.append({"isin": isin, "label": label, "quantity": quantity, "value_cents": amount, "price_cents": price, "valued_on": as_of})
    if not parsed and mode == "partial" and cash is None:
        raise DataError("Mise à jour vide.")
    return {"as_of": as_of, "mode": mode, "cash_cents": cash, "positions": parsed,
            "total_eur": euro(sum(row["value_cents"] for row in parsed) + (cash or 0)),
            "incomplete": sum(row["quantity"] is None for row in parsed)}


def account_state(db: sqlite3.Connection, account_id: str = "pea") -> dict:
    account = db.execute("SELECT * FROM pea_accounts WHERE id=?", (account_id,)).fetchone()
    if not account:
        return {"account": None, "positions": [], "imports": [], "total_eur": 0}
    positions = [dict(row) for row in db.execute("SELECT * FROM pea_positions WHERE account_id=? ORDER BY isin", (account_id,))]
    imports = [dict(row) for row in db.execute("SELECT id,as_of,mode,source FROM pea_imports WHERE account_id=? ORDER BY rowid DESC", (account_id,))]
    return {"account": dict(account), "positions": [{**row, "value_eur": euro(row["value_cents"]), "price_eur": euro(row["price_cents"])} for row in positions],
            "imports": imports, "total_eur": euro(account["cash_cents"] + sum(row["value_cents"] for row in positions))}


def ensure_account(db: sqlite3.Connection, label: str = "Mon PEA", holder: str = "non_precise", property_owner: str = "non_precise") -> None:
    if not db.execute("SELECT 1 FROM pea_accounts WHERE id='pea'").fetchone():
        db.execute("INSERT INTO pea_accounts(id,label,holder,property_owner) VALUES (?,?,?,?)", ("pea", label, holder, property_owner))


def apply_statement(db: sqlite3.Connection, parsed: dict, source: str = "import tableau") -> dict:
    if source not in ("import tableau", "saisie manuelle", "ancien navigateur"):
        raise DataError("Source inconnue.")
    normalized = {key: parsed[key] for key in ("as_of", "mode", "cash_cents", "positions")}
    fingerprint = hashlib.sha256(json.dumps(normalized, sort_keys=True).encode()).hexdigest()
    if db.execute("SELECT id FROM pea_imports WHERE fingerprint=?", (fingerprint,)).fetchone():
        return {"duplicate": True, **account_state(db)}
    before = account_state(db)
    previous_day = before["account"]["as_of"] if before["account"] else None
    if previous_day and parsed["as_of"] < previous_day:
        raise DataError("Relevé antérieur à la situation courante. Restaurez d'abord une sauvegarde si nécessaire.")
    with db:
        ensure_account(db)
        if parsed["mode"] == "complete":
            db.execute("DELETE FROM pea_positions WHERE account_id='pea'")
        for row in parsed["positions"]:
            db.execute("INSERT INTO pea_positions(account_id,isin,label,quantity,value_cents,price_cents,valued_on) VALUES ('pea',?,?,?,?,?,?) ON CONFLICT(account_id,isin) DO UPDATE SET label=excluded.label,quantity=excluded.quantity,value_cents=excluded.value_cents,price_cents=excluded.price_cents,valued_on=excluded.valued_on",
                       (row["isin"], row["label"], row["quantity"], row["value_cents"], row["price_cents"], row["valued_on"]))
        if parsed["cash_cents"] is not None:
            db.execute("UPDATE pea_accounts SET cash_cents=? WHERE id='pea'", (parsed["cash_cents"],))
        db.execute("UPDATE pea_accounts SET as_of=? WHERE id='pea'", (parsed["as_of"],))
        after = account_state(db)
        db.execute("INSERT INTO pea_imports VALUES (?,?,?,?,?,?,?,?,?)", (str(uuid.uuid4()), "pea", parsed["as_of"], parsed["mode"], fingerprint, parsed["cash_cents"], json.dumps(before), json.dumps(after), source))
    return {"duplicate": False, **account_state(db)}


def undo_latest(db: sqlite3.Connection, import_id: str) -> dict:
    latest = db.execute("SELECT * FROM pea_imports WHERE account_id='pea' ORDER BY rowid DESC LIMIT 1").fetchone()
    if not latest or latest["id"] != import_id:
        raise DataError("Seul le dernier import peut être annulé.")
    before = json.loads(latest["before_json"])
    with db:
        db.execute("DELETE FROM pea_positions WHERE account_id='pea'")
        if before["account"] is None:
            db.execute("DELETE FROM pea_imports WHERE id=?", (import_id,))
            db.execute("DELETE FROM pea_accounts WHERE id='pea'")
        else:
            account = before["account"]
            db.execute("UPDATE pea_accounts SET cash_cents=?,as_of=?,linked_item_id=?,linked_from=?,include_in_household=? WHERE id='pea'", (account["cash_cents"], account["as_of"], account["linked_item_id"], account["linked_from"], account["include_in_household"]))
            for row in before["positions"]:
                db.execute("INSERT INTO pea_positions VALUES (?,?,?,?,?,?,?)", ("pea", row["isin"], row["label"], row["quantity"], row["value_cents"], row["price_cents"], row["valued_on"]))
            db.execute("DELETE FROM pea_imports WHERE id=?", (import_id,))
    return account_state(db)


def link_aggregate(db: sqlite3.Connection, item_id: str, effective_from: str) -> dict:
    effective_from = day(effective_from)
    item = db.execute("SELECT * FROM items WHERE id=?", (item_id,)).fetchone()
    if not item or item["kind"] != "actif":
        raise DataError("Ancien poste PEA introuvable.")
    state = account_state(db)
    if state["account"] is None or state["account"]["linked_item_id"]:
        raise DataError("Compte absent ou déjà rapproché.")
    first_import = db.execute("SELECT MIN(as_of) FROM pea_imports WHERE account_id='pea'").fetchone()[0]
    if not first_import or effective_from < first_import:
        raise DataError("La date d'effet doit suivre ou égaler le premier relevé détaillé.")
    old = db.execute("SELECT value_cents FROM valuations WHERE item_id=? AND day<=? ORDER BY day DESC LIMIT 1", (item_id, effective_from)).fetchone()
    if not old or old["value_cents"] is None:
        raise DataError("Ancienne valorisation absente à la date d'effet.")
    difference = state["total_eur"] - euro(old["value_cents"])
    with db:
        db.execute("UPDATE pea_accounts SET linked_item_id=?,linked_from=?,include_in_household=1 WHERE id='pea'", (item_id, effective_from))
    return {"old_eur": euro(old["value_cents"]) if old else None, "new_eur": state["total_eur"], "difference_eur": difference}


def include_without_aggregate(db: sqlite3.Connection, property_owner: str) -> None:
    if property_owner not in {"non_precise", "commun", "conjoint_1", "conjoint_2", "enfants"}:
        raise DataError("Propriété invalide.")
    state = account_state(db)
    if not state["account"] or state["account"]["linked_item_id"]:
        raise DataError("Compte absent ou déjà rapproché.")
    with db:
        db.execute("UPDATE pea_accounts SET property_owner=?,include_in_household=1 WHERE id='pea'", (property_owner,))


def update_account(db: sqlite3.Connection, label: str, holder: str, property_owner: str) -> dict:
    if not all(isinstance(value, str) and 0 < len(value.strip()) <= 80 for value in (label, holder)):
        raise DataError("Nom du compte ou titulaire invalide.")
    if property_owner not in {"non_precise", "commun", "conjoint_1", "conjoint_2", "enfants"}:
        raise DataError("Propriété patrimoniale invalide.")
    with db:
        ensure_account(db)
        db.execute("UPDATE pea_accounts SET label=?,holder=?,property_owner=? WHERE id='pea'", (label.strip(), holder.strip(), property_owner))
    return account_state(db)


def statement_at(db: sqlite3.Connection, when: str) -> tuple[float, str] | None:
    row = db.execute("SELECT as_of,after_json FROM pea_imports WHERE account_id='pea' AND as_of<=? ORDER BY as_of DESC,rowid DESC LIMIT 1", (when,)).fetchone()
    if not row:
        return None
    state = json.loads(row["after_json"])
    return state["total_eur"], row["as_of"]


def total_at(db: sqlite3.Connection, when: str) -> float | None:
    statement = statement_at(db, when)
    return statement[0] if statement else None
