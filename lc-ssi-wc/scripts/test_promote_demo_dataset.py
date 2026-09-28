from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from scripts.promote_demo_dataset import clean_database, materialize_server_export


class CleanDatabaseTest(unittest.TestCase):
    def test_materializes_a_server_export_without_internal_source_identity(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            seed_path = root / "server-export.seed.json"
            database_path = root / "materialized.sqlite"
            seed_path.write_text(
                json.dumps(
                    {
                        "schemaVersion": "1.0",
                        "classification": "SYNTHETIC_DEMO_QA_UAT",
                        "schema": [
                            {
                                "type": "table",
                                "name": "sample",
                                "table": "sample",
                                "sql": "CREATE TABLE sample (id TEXT PRIMARY KEY, value TEXT)",
                            }
                        ],
                        "tables": {
                            "sample": {
                                "columns": ["id", "value"],
                                "rows": [["ONE", "demo"]],
                            }
                        },
                    }
                ),
                encoding="utf-8",
            )

            materialize_server_export(seed_path, database_path)

            connection = sqlite3.connect(database_path)
            try:
                self.assertEqual(
                    connection.execute("SELECT * FROM sample").fetchall(),
                    [("ONE", "demo")],
                )
            finally:
                connection.close()

    def test_keeps_active_master_data_and_removes_runtime_history(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            database_path = Path(directory) / "candidate.sqlite"
            connection = sqlite3.connect(database_path)
            try:
                for table in (
                    "booking_branch_entity",
                    "nostro_account",
                    "rma_authorisation",
                    "ssi",
                ):
                    connection.execute(
                        f"CREATE TABLE {table} "
                        "(id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)"
                    )
                    for status in ("ACTIVE", "DRAFT", "WIP", "SUPERSEDED"):
                        connection.execute(
                            f"INSERT INTO {table} VALUES (?,?,?)",
                            (
                                f"{table}-{status}",
                                json.dumps({"id": f"{table}-{status}", "status": status}),
                                "2026-09-28T00:00:00.000Z",
                            ),
                        )
                connection.execute(
                    "INSERT INTO rma_authorisation VALUES (?,?,?)",
                    (
                        "rma-controlled-fixture",
                        json.dumps(
                            {
                                "id": "rma-controlled-fixture",
                                "status": "SUPERSEDED",
                                "fixtureFamily": "MT347-SR2026-SSI",
                                "fixtureBindingId": "FIX-MT300-001@v1",
                            }
                        ),
                        "2026-09-28T00:00:00.000Z",
                    ),
                )
                connection.execute(
                    "CREATE TABLE ssi_applicability "
                    "(id TEXT PRIMARY KEY, ssi_id TEXT NOT NULL, payload TEXT NOT NULL, "
                    "updated_at TEXT NOT NULL)"
                )
                connection.executemany(
                    "INSERT INTO ssi_applicability VALUES (?,?,?,?)",
                    [
                        (
                            "APPL-ACTIVE",
                            "ssi-ACTIVE",
                            json.dumps({"status": "ACTIVE"}),
                            "2026-09-28T00:00:00.000Z",
                        ),
                        (
                            "APPL-ORPHAN",
                            "ssi-DRAFT",
                            json.dumps({"status": "ACTIVE"}),
                            "2026-09-28T00:00:00.000Z",
                        ),
                        (
                            "APPL-DRAFT",
                            "ssi-ACTIVE",
                            json.dumps({"status": "DRAFT"}),
                            "2026-09-28T00:00:00.000Z",
                        ),
                    ],
                )
                connection.execute(
                    "CREATE TABLE audit_event "
                    "(id INTEGER PRIMARY KEY, ssi_id TEXT, action TEXT, actor TEXT, "
                    "payload TEXT, occurred_at TEXT)"
                )
                connection.execute(
                    "INSERT INTO audit_event VALUES (1,'ssi-ACTIVE','CREATED','maker',"
                    "'{}','2026-09-28T00:00:00.000Z')"
                )
                connection.execute(
                    "CREATE TABLE outbox "
                    "(id INTEGER PRIMARY KEY, event_id TEXT, event_type TEXT, payload TEXT, "
                    "status TEXT, created_at TEXT)"
                )
                connection.execute(
                    "INSERT INTO outbox VALUES (1,'event','CREATED','{}','ACTIVE',"
                    "'2026-09-28T00:00:00.000Z')"
                )
                connection.commit()
            finally:
                connection.close()

            summary = clean_database(database_path)

            connection = sqlite3.connect(database_path)
            try:
                for table in (
                    "booking_branch_entity",
                    "nostro_account",
                    "ssi",
                ):
                    self.assertEqual(
                        connection.execute(f"SELECT id FROM {table}").fetchall(),
                        [(f"{table}-ACTIVE",)],
                    )
                self.assertEqual(
                    connection.execute(
                        "SELECT id FROM rma_authorisation ORDER BY id"
                    ).fetchall(),
                    [("rma-controlled-fixture",), ("rma_authorisation-ACTIVE",)],
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT id FROM ssi_applicability"
                    ).fetchall(),
                    [("APPL-ACTIVE",)],
                )
                self.assertEqual(
                    connection.execute("SELECT COUNT(*) FROM audit_event").fetchone()[0],
                    0,
                )
                self.assertEqual(
                    connection.execute("SELECT COUNT(*) FROM outbox").fetchone()[0],
                    0,
                )
            finally:
                connection.close()

            self.assertEqual(summary["ssi"], 1)
            self.assertEqual(summary["ssi_applicability"], 1)
            self.assertEqual(summary["audit_event"], 0)


if __name__ == "__main__":
    unittest.main()
