"""Declared investment context; scenarios never mutate actual holdings."""

from __future__ import annotations

import json
import math
import re
import sqlite3
import uuid
from datetime import date

from local_data import DataError, cents, day, euro, snapshot


def migrate_v4(db: sqlite3.Connection) -> None:
    db.executescript("""
        BEGIN IMMEDIATE;
        CREATE TABLE accounts (id TEXT PRIMARY KEY,label TEXT NOT NULL,holder TEXT NOT NULL,envelope TEXT NOT NULL);
        CREATE TABLE projects (
            id TEXT PRIMARY KEY,label TEXT NOT NULL,kind TEXT NOT NULL,
            amount_cents INTEGER NOT NULL,due_on TEXT,funding_item_id TEXT REFERENCES items(id)
        );
        CREATE TABLE funding_choices (item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,selected INTEGER NOT NULL);
        CREATE TABLE budget_settings (
            id INTEGER PRIMARY KEY CHECK(id=1),monthly_cents INTEGER NOT NULL DEFAULT 0,
            chosen_deposit_cents INTEGER NOT NULL DEFAULT 0,horizon_years INTEGER,
            risk TEXT NOT NULL DEFAULT 'non_precise'
        );
        INSERT INTO budget_settings(id) VALUES (1);
        CREATE TABLE investment_targets (
            id TEXT PRIMARY KEY,name TEXT NOT NULL,weights_json TEXT NOT NULL,
            source TEXT NOT NULL,created_on TEXT NOT NULL,version INTEGER NOT NULL,active INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX one_active_target ON investment_targets(active) WHERE active=1;
        PRAGMA user_version=4;
        COMMIT;
    """)


def budget_state(db: sqlite3.Connection, when: str | None = None) -> dict:
    as_of = when or date.today().isoformat()
    current = snapshot(db, as_of)
    projects = [dict(row) for row in db.execute("SELECT * FROM projects ORDER BY due_on,label")]
    selected = {row["item_id"] for row in db.execute("SELECT * FROM funding_choices WHERE selected=1")}
    sources = []
    for item in current["items"]:
        if item["kind"] != "actif" or item["asset_class"] != "liquidite" or item["owner"] == "enfants" or item["status"] == "previsionnel":
            continue
        reserved = sum(project["amount_cents"] for project in projects if project["funding_item_id"] == item["id"])
        eligible = item["usage"] == "libre"
        available = max(0, round(item["value_eur"] * 100) - reserved) if eligible and item["id"] in selected else 0
        sources.append({"item": item, "selected": item["id"] in selected, "eligible": eligible,
                        "reserved_eur": euro(reserved), "available_eur": euro(available),
                        "over_reserved": reserved > round(item["value_eur"] * 100)})
    settings = dict(db.execute("SELECT * FROM budget_settings WHERE id=1").fetchone())
    targets = [dict(row) for row in db.execute("SELECT * FROM investment_targets ORDER BY version DESC")]
    for target in targets:
        target["weights"] = json.loads(target.pop("weights_json"))
    financial = sum(round(item["value_eur"] * 100) for item in current["items"] if item["kind"] == "actif" and item["owner"] != "enfants" and item["status"] != "previsionnel" and item["asset_class"] in ("liquidite", "titre"))
    unknown = sum(round(item["value_eur"] * 100) for item in current["items"] if item["kind"] == "actif" and item["owner"] != "enfants" and item["status"] != "previsionnel" and item["asset_class"] == "inconnu")
    return {"snapshot": current, "accounts": [dict(row) for row in db.execute("SELECT * FROM accounts ORDER BY label")],
            "projects": [{**project, "amount_eur": euro(project["amount_cents"])} for project in projects],
            "sources": sources, "settings": {**settings, "monthly_eur": euro(settings["monthly_cents"]), "chosen_deposit_eur": euro(settings["chosen_deposit_cents"])},
            "targets": targets, "financial_eur": euro(financial), "unknown_eur": euro(unknown),
            "max_oneoff_eur": sum(source["available_eur"] for source in sources)}


def save_account(db: sqlite3.Connection, value: dict) -> str:
    label = value.get("label")
    holder = value.get("holder")
    envelope = value.get("envelope")
    if not all(isinstance(text, str) and 0 < len(text.strip()) <= 80 for text in (label, holder, envelope)):
        raise DataError("Compte, titulaire ou enveloppe invalide.")
    identifier = value.get("id") or str(uuid.uuid4())
    with db:
        db.execute("INSERT INTO accounts VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,holder=excluded.holder,envelope=excluded.envelope",
                   (identifier, label.strip(), holder.strip(), envelope.strip()))
    return identifier


def save_project(db: sqlite3.Connection, value: dict) -> str:
    label = value.get("label")
    kind = value.get("kind")
    if not isinstance(label, str) or not 0 < len(label.strip()) <= 80 or kind not in ("projet", "reserve"):
        raise DataError("Projet ou réserve invalide.")
    amount = cents(value.get("amount_eur"))
    due = day(value["due_on"]) if value.get("due_on") else None
    item_id = value.get("funding_item_id") or None
    if item_id and not db.execute("SELECT 1 FROM items WHERE id=?", (item_id,)).fetchone():
        raise DataError("Compte de financement inconnu.")
    identifier = value.get("id") or str(uuid.uuid4())
    with db:
        db.execute("INSERT INTO projects VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,kind=excluded.kind,amount_cents=excluded.amount_cents,due_on=excluded.due_on,funding_item_id=excluded.funding_item_id",
                   (identifier, label.strip(), kind, amount, due, item_id))
    return identifier


def select_source(db: sqlite3.Connection, item_id: str, selected: bool) -> None:
    item = db.execute("SELECT kind,asset_class,status,owner FROM items WHERE id=?", (item_id,)).fetchone()
    if not item or item["kind"] != "actif" or item["asset_class"] != "liquidite" or item["status"] != "actuel" or item["owner"] == "enfants":
        raise DataError("Source non liquide ou hors foyer.")
    if not isinstance(selected, bool):
        raise DataError("Choix de source invalide.")
    with db:
        db.execute("INSERT INTO funding_choices VALUES (?,?) ON CONFLICT(item_id) DO UPDATE SET selected=excluded.selected", (item_id, int(selected)))


def save_settings(db: sqlite3.Connection, value: dict) -> dict:
    monthly = cents(value.get("monthly_eur"))
    chosen = cents(value.get("chosen_deposit_eur"))
    horizon = value.get("horizon_years")
    if horizon not in (None, ""):
        try:
            horizon = int(horizon)
        except (TypeError, ValueError) as exc:
            raise DataError("Horizon invalide.") from exc
        if not 1 <= horizon <= 60:
            raise DataError("Horizon entre 1 et 60 ans attendu.")
    else:
        horizon = None
    risk = value.get("risk", "non_precise")
    if risk not in ("non_precise", "prudent", "equilibre", "dynamique"):
        raise DataError("Niveau de risque invalide.")
    maximum = round(budget_state(db)["max_oneoff_eur"] * 100)
    if chosen > maximum:
        raise DataError("Versement choisi supérieur aux liquidités mobilisables.")
    with db:
        db.execute("UPDATE budget_settings SET monthly_cents=?,chosen_deposit_cents=?,horizon_years=?,risk=? WHERE id=1", (monthly, chosen, horizon, risk))
    return budget_state(db)


def activate_target(db: sqlite3.Connection, value: dict) -> dict:
    name = value.get("name")
    weights = value.get("weights")
    source = value.get("source", "panier")
    if not isinstance(name, str) or not 0 < len(name.strip()) <= 80 or not isinstance(weights, dict) or not weights:
        raise DataError("Cible invalide.")
    if not isinstance(source, str) or len(source) > 80:
        raise DataError("Source invalide.")
    if any(not re.fullmatch(r"[A-Z]{2}[A-Z0-9]{10}", key) or not isinstance(weight, (int, float)) or isinstance(weight, bool) or not math.isfinite(weight) or weight < 0 or weight > 100 for key, weight in weights.items()):
        raise DataError("Poids ou ISIN invalide.")
    if sum(weights.values()) > 100.00001:
        raise DataError("La somme des poids dépasse 100 %.")
    version = db.execute("SELECT COALESCE(MAX(version),0)+1 FROM investment_targets").fetchone()[0]
    identifier = str(uuid.uuid4())
    with db:
        db.execute("UPDATE investment_targets SET active=0 WHERE active=1")
        db.execute("INSERT INTO investment_targets VALUES (?,?,?,?,?,?,1)", (identifier, name.strip(), json.dumps(weights), source, date.today().isoformat(), version))
    return budget_state(db)
