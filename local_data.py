"""Versioned household data. Amounts are stored in cents."""

from __future__ import annotations

import json
import re
import sqlite3
import uuid
from datetime import date
from decimal import Decimal, InvalidOperation


class DataError(ValueError):
    pass


OWNERS = {"non_precise", "commun", "conjoint_1", "conjoint_2", "enfants"}
STATUSES = {"actuel", "previsionnel"}
USES = {"libre", "reserve", "urgence"}
CLASSES = {"inconnu", "liquidite", "immobilier", "titre", "autre"}


def migrate_v2(db: sqlite3.Connection) -> None:
    db.executescript("""
        BEGIN IMMEDIATE;
        CREATE TABLE items (
            id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('actif','passif')),
            category TEXT NOT NULL, label TEXT NOT NULL, owner TEXT NOT NULL,
            status TEXT NOT NULL, usage TEXT NOT NULL, asset_class TEXT NOT NULL DEFAULT 'inconnu',
            account_id TEXT, schedule_id TEXT, created_on TEXT NOT NULL,
            linked_account_from TEXT
        );
        CREATE UNIQUE INDEX one_debt_per_schedule ON items(schedule_id) WHERE schedule_id IS NOT NULL;
        CREATE TABLE valuations (
            item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
            day TEXT NOT NULL, value_cents INTEGER, verified_on TEXT NOT NULL,
            source TEXT NOT NULL, original_json TEXT,
            PRIMARY KEY(item_id, day)
        );
        CREATE TABLE schedules (id TEXT PRIMARY KEY, label TEXT NOT NULL, metadata_json TEXT NOT NULL);
        CREATE TABLE schedule_rows (
            schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
            due_on TEXT NOT NULL, before_cents INTEGER NOT NULL, repay_cents INTEGER NOT NULL,
            interest_cents INTEGER NOT NULL, insurance_cents INTEGER NOT NULL,
            payment_cents INTEGER NOT NULL, after_cents INTEGER NOT NULL,
            PRIMARY KEY(schedule_id, due_on)
        );
        PRAGMA user_version = 2;
        COMMIT;
    """)


def day(value: object) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise DataError("Date invalide : AAAA-MM-JJ attendu.")
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError as exc:
        raise DataError("Date invalide.") from exc


def cents(value: object, nullable: bool = False) -> int | None:
    if nullable and (value is None or value == ""):
        return None
    try:
        number = Decimal(str(value).replace("\u202f", "").replace(" ", "").replace(",", "."))
    except (InvalidOperation, TypeError) as exc:
        raise DataError("Montant invalide.") from exc
    if not number.is_finite() or number < 0 or number > Decimal("1000000000000000") or number.as_tuple().exponent < -2:
        raise DataError("Montant positif avec au plus deux décimales attendu.")
    return int(number * 100)


def euro(value: int | None) -> float | None:
    return None if value is None else value / 100


def save_item(db: sqlite3.Connection, value: dict) -> str:
    with db:
        return _save_item(db, value)


def save_items(db: sqlite3.Connection, values: list[dict]) -> list[str]:
    if not isinstance(values, list) or not 1 <= len(values) <= 500 or any(not isinstance(value, dict) for value in values):
        raise DataError("Liste de postes invalide (1 à 500 lignes attendues).")
    explicit_ids = [value["id"] for value in values if value.get("id")]
    if any(not isinstance(identifier, str) for identifier in explicit_ids):
        raise DataError("Identifiant de poste invalide.")
    if len(explicit_ids) != len(set(explicit_ids)):
        raise DataError("Le même poste apparaît plusieurs fois dans l'enregistrement.")
    with db:
        return [_save_item(db, value) for value in values]


def _save_item(db: sqlite3.Connection, value: dict) -> str:
    identifier = value.get("id") or str(uuid.uuid4())
    if not isinstance(identifier, str) or len(identifier) > 80:
        raise DataError("Identifiant invalide.")
    kind, owner, status, usage, asset_class = (value.get(field) for field in ("kind", "owner", "status", "usage", "asset_class"))
    if kind not in {"actif", "passif"} or owner not in OWNERS or status not in STATUSES or usage not in USES or asset_class not in CLASSES:
        raise DataError("Classification invalide.")
    category, label = (value.get(field) for field in ("category", "label"))
    if not all(isinstance(text, str) and 0 < len(text.strip()) <= 80 for text in (category, label)):
        raise DataError("Nom ou catégorie invalide.")
    when = day(value.get("day"))
    verified = day(value.get("verified_on") or when)
    amount = cents(value.get("value_eur"), nullable=bool(value.get("schedule_id")))
    schedule_id = value.get("schedule_id") or None
    account_id = value.get("account_id") or None
    if account_id and not db.execute("SELECT 1 FROM accounts WHERE id=?", (account_id,)).fetchone():
        raise DataError("Compte ou enveloppe inconnu.")
    if schedule_id and (kind != "passif" or not db.execute("SELECT 1 FROM schedules WHERE id=?", (schedule_id,)).fetchone()):
        raise DataError("Échéancier inconnu ou lié à un actif.")
    if schedule_id and value.get("value_eur") not in (None, ""):
        raise DataError("Une dette liée n'a pas de valeur manuelle.")
    exists = db.execute("SELECT id FROM items WHERE id=?", (identifier,)).fetchone()
    if exists:
        db.execute("UPDATE items SET kind=?, category=?, label=?, owner=?, status=?, usage=?, asset_class=?, schedule_id=?, account_id=? WHERE id=?",
                   (kind, category.strip(), label.strip(), owner, status, usage, asset_class, schedule_id, account_id, identifier))
    else:
        db.execute("INSERT INTO items (id,kind,category,label,owner,status,usage,asset_class,schedule_id,created_on,account_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                   (identifier, kind, category.strip(), label.strip(), owner, status, usage, asset_class, schedule_id, when, account_id))
    previous = db.execute("SELECT value_cents,verified_on FROM valuations WHERE item_id=? AND day=?", (identifier, when)).fetchone()
    if not previous or previous["value_cents"] != amount or previous["verified_on"] != verified:
        db.execute("INSERT INTO valuations VALUES (?,?,?,?,?,?) ON CONFLICT(item_id,day) DO UPDATE SET value_cents=excluded.value_cents,verified_on=excluded.verified_on,source=excluded.source,original_json=excluded.original_json",
                   (identifier, when, amount, verified, "saisie manuelle", None))
    return identifier


def snapshot(db: sqlite3.Connection, when: str) -> dict:
    when = day(when)
    from local_pea import total_at
    items = []
    for row in db.execute("SELECT * FROM items ORDER BY category,label"):
        valuation = db.execute("SELECT * FROM valuations WHERE item_id=? AND day<=? ORDER BY day DESC LIMIT 1", (row["id"], when)).fetchone()
        if not valuation:
            continue
        amount = valuation["value_cents"]
        last_due = None
        if row["schedule_id"]:
            first = db.execute("SELECT before_cents FROM schedule_rows WHERE schedule_id=? ORDER BY due_on LIMIT 1", (row["schedule_id"],)).fetchone()
            last = db.execute("SELECT due_on,after_cents FROM schedule_rows WHERE schedule_id=? AND due_on<=? ORDER BY due_on DESC LIMIT 1", (row["schedule_id"], when)).fetchone()
            amount = last["after_cents"] if last else first["before_cents"] if first else amount
            last_due = last["due_on"] if last else None
        items.append({**dict(row), "day": valuation["day"], "value_eur": euro(amount), "verified_on": valuation["verified_on"], "source": valuation["source"], "last_due": last_due})
    pea = db.execute("SELECT * FROM pea_accounts WHERE id='pea'").fetchone()
    if pea and pea["include_in_household"]:
        total = total_at(db, when)
        if total is not None and pea["linked_item_id"] and when >= pea["linked_from"]:
            for item in items:
                if item["id"] == pea["linked_item_id"]:
                    item.update(value_eur=total, source="relevé PEA détaillé", day=pea["linked_from"], asset_class="titre")
                    break
        elif total is not None and not pea["linked_item_id"]:
            items.append({"id": "pea", "kind": "actif", "category": "PEA", "label": pea["label"], "owner": pea["property_owner"], "status": "actuel", "usage": "libre", "asset_class": "titre", "account_id": "pea", "schedule_id": None, "created_on": pea["as_of"], "linked_account_from": None, "day": pea["as_of"], "value_eur": total, "verified_on": pea["as_of"], "source": "relevé PEA détaillé", "last_due": None})
    current = [item for item in items if item["status"] != "previsionnel" and item["owner"] != "enfants"]
    assets = sum(round(item["value_eur"] * 100) for item in current if item["kind"] == "actif")
    debts = sum(round(item["value_eur"] * 100) for item in current if item["kind"] == "passif")
    return {"day": when, "items": items, "assets_eur": euro(assets), "debts_eur": euro(debts), "net_eur": euro(assets - debts)}


def household(db: sqlite3.Connection, when: str | None = None) -> dict:
    dates = {row[0] for row in db.execute("SELECT day FROM valuations")}
    if dates:
        dates.add(date.today().isoformat())
    for row in db.execute("SELECT sr.due_on FROM schedule_rows sr JOIN items i ON i.schedule_id=sr.schedule_id"):
        if row[0] <= date.today().isoformat():
            dates.add(row[0])
    for row in db.execute("SELECT as_of FROM pea_imports"):
        dates.add(row[0])
    selected = when or (max(dates) if dates else date.today().isoformat())
    schedules = []
    for row in db.execute("SELECT * FROM schedules ORDER BY label"):
        last = db.execute("SELECT due_on,after_cents FROM schedule_rows WHERE schedule_id=? ORDER BY due_on DESC LIMIT 1", (row["id"],)).fetchone()
        schedules.append({"id": row["id"], "label": row["label"], "metadata": json.loads(row["metadata_json"]),
                          "rows": db.execute("SELECT COUNT(*) FROM schedule_rows WHERE schedule_id=?", (row["id"],)).fetchone()[0],
                          "last_due": last["due_on"] if last else None, "final_balance_eur": euro(last["after_cents"]) if last else None})
    return {"dates": sorted(dates), "snapshot": snapshot(db, selected), "schedules": schedules,
            "history": [{"day": selected_day, "net_eur": snapshot(db, selected_day)["net_eur"]} for selected_day in sorted(dates)]}


def schedule_detail(db: sqlite3.Connection, schedule_id: str) -> dict:
    schedule = db.execute("SELECT * FROM schedules WHERE id=?", (schedule_id,)).fetchone()
    if not schedule:
        raise DataError("Échéancier introuvable.")
    rows = db.execute("SELECT * FROM schedule_rows WHERE schedule_id=? ORDER BY due_on", (schedule_id,)).fetchall()
    return {"id": schedule["id"], "label": schedule["label"],
            "metadata": json.loads(schedule["metadata_json"]),
            "rows": [{"due_on": row["due_on"], "before_eur": euro(row["before_cents"]),
                      "repay_eur": euro(row["repay_cents"]), "interest_eur": euro(row["interest_cents"]),
                      "insurance_eur": euro(row["insurance_cents"]), "payment_eur": euro(row["payment_cents"]),
                      "after_eur": euro(row["after_cents"])} for row in rows]}
