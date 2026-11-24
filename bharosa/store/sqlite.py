from __future__ import annotations

import sqlite3
import threading

from ..models import Action, Event, Household

SCHEMA = """
CREATE TABLE IF NOT EXISTS households (id TEXT PRIMARY KEY, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tokens (hash TEXT PRIMARY KEY, household_id TEXT NOT NULL, role TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS actions (
    household_id TEXT NOT NULL, id TEXT NOT NULL, doc TEXT NOT NULL,
    PRIMARY KEY (household_id, id));
CREATE TABLE IF NOT EXISTS events (
    household_id TEXT NOT NULL, id TEXT NOT NULL, ts REAL NOT NULL, doc TEXT NOT NULL,
    PRIMARY KEY (household_id, id));
CREATE INDEX IF NOT EXISTS events_ts ON events (household_id, ts);
"""


class SQLiteStore:
    def __init__(self, path: str = "bharosa.db"):
        self._db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._db.execute("PRAGMA journal_mode=WAL") if path != ":memory:" else None
        self._lock = threading.Lock()
        with self._lock:
            self._db.executescript(SCHEMA)

    def _exec(self, sql: str, args: tuple = ()):
        with self._lock:
            return self._db.execute(sql, args).fetchall()

    def put_household(self, hh: Household) -> None:
        self._exec("INSERT OR REPLACE INTO households VALUES (?, ?)", (hh.id, hh.model_dump_json()))

    def get_household(self, household_id: str) -> Household | None:
        rows = self._exec("SELECT doc FROM households WHERE id = ?", (household_id,))
        return Household.model_validate_json(rows[0][0]) if rows else None

    def list_households(self) -> list[Household]:
        return [Household.model_validate_json(r[0]) for r in self._exec("SELECT doc FROM households")]

    def put_token(self, token_hash: str, household_id: str, role: str) -> None:
        self._exec("INSERT OR REPLACE INTO tokens VALUES (?, ?, ?)", (token_hash, household_id, role))

    def resolve_token(self, token_hash: str) -> tuple[str, str] | None:
        rows = self._exec("SELECT household_id, role FROM tokens WHERE hash = ?", (token_hash,))
        return (rows[0][0], rows[0][1]) if rows else None

    def put_action(self, action: Action) -> None:
        self._exec("INSERT OR REPLACE INTO actions VALUES (?, ?, ?)",
                   (action.household_id, action.id, action.model_dump_json()))

    def get_action(self, household_id: str, action_id: str) -> Action | None:
        rows = self._exec("SELECT doc FROM actions WHERE household_id = ? AND id = ?",
                          (household_id, action_id))
        return Action.model_validate_json(rows[0][0]) if rows else None

    def list_actions(self, household_id: str, limit: int = 200) -> list[Action]:
        rows = self._exec("SELECT doc FROM actions WHERE household_id = ? ORDER BY id DESC LIMIT ?",
                          (household_id, limit))
        return [Action.model_validate_json(r[0]) for r in rows]

    def add_event(self, event: Event) -> None:
        self._exec("INSERT OR REPLACE INTO events VALUES (?, ?, ?, ?)",
                   (event.household_id, event.id, event.ts, event.model_dump_json()))

    def list_events(self, household_id: str, limit: int = 100) -> list[Event]:
        rows = self._exec("SELECT doc FROM events WHERE household_id = ? ORDER BY ts DESC, id DESC LIMIT ?",
                          (household_id, limit))
        return [Event.model_validate_json(r[0]) for r in rows]
