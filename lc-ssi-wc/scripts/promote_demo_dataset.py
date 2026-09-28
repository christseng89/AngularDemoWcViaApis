"""Promote a server export into a clean first-install demo dataset.

The source export is never changed. Runtime lifecycle history is removed from a
temporary SQLite database, the result is rebuilt and verified, and only then is
the existing canonical seed archived and atomically replaced.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import shutil
import sqlite3
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
_REBUILD_SCRIPT = Path(__file__).with_name("rebuild-demo-database.py")
_REBUILD_SPEC = importlib.util.spec_from_file_location(
    "rebuild_demo_database", _REBUILD_SCRIPT
)
if _REBUILD_SPEC is None or _REBUILD_SPEC.loader is None:
    raise ImportError(f"cannot load canonical seed utility: {_REBUILD_SCRIPT}")
_REBUILD_MODULE = importlib.util.module_from_spec(_REBUILD_SPEC)
_REBUILD_SPEC.loader.exec_module(_REBUILD_MODULE)
export_seed = _REBUILD_MODULE.export_seed
rebuild = _REBUILD_MODULE.rebuild
sha256 = _REBUILD_MODULE.sha256
decode = _REBUILD_MODULE.decode


DEFAULT_TARGET = (
    ROOT
    / "data"
    / "reload-test-data"
    / "ssi-demo.mt1-mt2.v1.approved.canonical.seed.json"
)
DEFAULT_ARCHIVE = ROOT / "qa-archived" / "reload-test-data"
CANONICAL_FIXTURE_ID = "SSI-DEMO-MT1-MT2-PACS008-PACS009-V1"

MASTER_STATUS_TABLES = (
    "booking_branch_entity",
    "nostro_account",
    "rma_authorisation",
    "ssi",
)
PURGED_RUNTIME_TABLES = (
    "audit_event",
    "audit_event_archive",
    "booking_branch_entity_audit",
    "inbox",
    "nostro_audit_event",
    "outbox",
    "rma_audit_event",
    "swift_data_outbox",
)


def _table_exists(connection: sqlite3.Connection, table: str) -> bool:
    return (
        connection.execute(
            "SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?", (table,)
        ).fetchone()
        is not None
    )


def _quote_identifier(value: str) -> str:
    return f'"{value.replace(chr(34), chr(34) * 2)}"'


def materialize_server_export(seed_path: Path, database_path: Path) -> None:
    """Materialize a trusted local server export that has no internal source SHA."""

    seed = json.loads(seed_path.read_text(encoding="utf-8"))
    if (
        seed.get("schemaVersion") != "1.0"
        or seed.get("classification") != "SYNTHETIC_DEMO_QA_UAT"
    ):
        raise AssertionError("refuse materialization from an incompatible demo seed")
    schema = seed.get("schema")
    tables = seed.get("tables")
    if not isinstance(schema, list) or not isinstance(tables, dict):
        raise AssertionError("server export schema or tables are missing")

    database_path.parent.mkdir(parents=True, exist_ok=True)
    if database_path.exists():
        database_path.unlink()
    connection = sqlite3.connect(database_path)
    try:
        connection.execute("BEGIN IMMEDIATE")
        table_names = {
            item.get("name")
            for item in schema
            if isinstance(item, dict) and item.get("type") == "table"
        }
        for item in schema:
            if item.get("type") == "table":
                connection.execute(item["sql"])
        for table_name, table in tables.items():
            if table_name not in table_names:
                raise AssertionError(f"undeclared export table: {table_name}")
            columns = table["columns"]
            quoted_columns = ",".join(_quote_identifier(value) for value in columns)
            placeholders = ",".join("?" for _ in columns)
            connection.executemany(
                f"INSERT INTO {_quote_identifier(table_name)} "
                f"({quoted_columns}) VALUES ({placeholders})",
                ([decode(value) for value in row] for row in table["rows"]),
            )
        for item in schema:
            if item.get("type") != "table":
                connection.execute(item["sql"])
        connection.execute("COMMIT")
        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise AssertionError(f"materialized database integrity check failed: {integrity}")
    except Exception:
        if connection.in_transaction:
            connection.execute("ROLLBACK")
        raise
    finally:
        connection.close()


def clean_database(database_path: Path) -> dict[str, int]:
    """Keep effective Active master data and remove transient runtime history."""

    connection = sqlite3.connect(database_path)
    try:
        connection.execute("BEGIN IMMEDIATE")
        for table in MASTER_STATUS_TABLES:
            if _table_exists(connection, table):
                connection.execute(
                    f'DELETE FROM "{table}" '
                    "WHERE COALESCE(json_extract(payload,'$.status'),'') <> 'ACTIVE' "
                    "AND json_extract(payload,'$.fixtureFamily') IS NULL "
                    "AND json_extract(payload,'$.fixtureBindingId') IS NULL "
                    "AND COALESCE(json_array_length(json_extract(payload,'$.fixtureBindingIds')),0)=0 "
                    "AND COALESCE(json_extract(payload,'$.usageGroup'),'')='' "
                    "AND COALESCE(json_extract(payload,'$.dataUse'),'') "
                    "NOT IN ('BASELINE','FIXTURE','QA') "
                    "AND COALESCE(json_extract(payload,'$.ownLegalEntityId'),'') "
                    "NOT LIKE 'BASELINE-%'"
                )

        if _table_exists(connection, "ssi_applicability"):
            connection.execute(
                "DELETE FROM ssi_applicability "
                "WHERE COALESCE(json_extract(payload,'$.status'),'') <> 'ACTIVE' "
                "OR NOT EXISTS (SELECT 1 FROM ssi WHERE ssi.id=ssi_applicability.ssi_id)"
            )

        for table in PURGED_RUNTIME_TABLES:
            if _table_exists(connection, table):
                connection.execute(f'DELETE FROM "{table}"')

        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise AssertionError(f"cleaned database integrity check failed: {integrity}")
        connection.execute("COMMIT")

        summary: dict[str, int] = {}
        for table in (*MASTER_STATUS_TABLES, "ssi_applicability", *PURGED_RUNTIME_TABLES):
            if _table_exists(connection, table):
                summary[table] = connection.execute(
                    f'SELECT COUNT(*) FROM "{table}"'
                ).fetchone()[0]
        return summary
    except Exception:
        if connection.in_transaction:
            connection.execute("ROLLBACK")
        raise
    finally:
        connection.close()


def promote_dataset(
    source_seed: Path,
    target_seed: Path = DEFAULT_TARGET,
    archive_directory: Path = DEFAULT_ARCHIVE,
) -> dict[str, Any]:
    """Build, clean, verify, archive the old seed, and install the new seed."""

    source_seed = source_seed.resolve()
    target_seed = target_seed.resolve()
    archive_directory = archive_directory.resolve()
    if source_seed == target_seed:
        raise ValueError("source export and canonical target must be different files")
    if not source_seed.is_file():
        raise FileNotFoundError(source_seed)

    temporary_root = ROOT / "tmp"
    temporary_root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix="canonical-promotion-", dir=temporary_root
    ) as directory:
        workspace = Path(directory)
        candidate_database = workspace / "candidate.sqlite"
        candidate_seed = workspace / "candidate.seed.json"
        verification_database = workspace / "verification.sqlite"

        materialize_server_export(source_seed, candidate_database)
        counts = clean_database(candidate_database)
        exported = export_seed(
            candidate_database,
            candidate_seed,
            CANONICAL_FIXTURE_ID,
            source_seed.relative_to(ROOT).as_posix(),
        )
        verified = rebuild(candidate_seed, verification_database)

        archived: str | None = None
        previous_sha: str | None = None
        if target_seed.exists():
            previous_sha = sha256(target_seed)
            archive_directory.mkdir(parents=True, exist_ok=True)
            archive_name = (
                f"{target_seed.stem}.{previous_sha[:12]}.superseded"
                f"{target_seed.suffix}"
            )
            archive_path = archive_directory / archive_name
            if not archive_path.exists():
                shutil.copy2(target_seed, archive_path)
            archived = archive_path.relative_to(ROOT).as_posix()
            metadata_path = archive_path.with_suffix(f"{archive_path.suffix}.archive.json")
            metadata_path.write_text(
                json.dumps(
                    {
                        "status": "SUPERSEDED_ARCHIVED",
                        "archivedAt": datetime.now(UTC).isoformat(),
                        "originalPath": target_seed.relative_to(ROOT).as_posix(),
                        "sha256": previous_sha,
                        "replacementSource": source_seed.relative_to(ROOT).as_posix(),
                    },
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )

        target_seed.parent.mkdir(parents=True, exist_ok=True)
        # Create the install file beside the target so it inherits the target
        # directory's Windows ACL. Moving the tempfile directly from tmp/ can
        # otherwise leave the canonical seed unreadable to Git or another user.
        install_candidate = target_seed.with_name(
            f".{target_seed.name}.{os.getpid()}.installing"
        )
        try:
            shutil.copyfile(candidate_seed, install_candidate)
            os.replace(install_candidate, target_seed)
        finally:
            install_candidate.unlink(missing_ok=True)
        return {
            "source": source_seed.relative_to(ROOT).as_posix(),
            "target": target_seed.relative_to(ROOT).as_posix(),
            "archived": archived,
            "previousSha256": previous_sha,
            "newSha256": sha256(target_seed),
            "logicalSha256": exported["logicalSha256"],
            "verifiedLogicalSha256": verified["logicalSha256"],
            "tables": counts,
        }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-export", type=Path, required=True)
    parser.add_argument("--target-seed", type=Path, default=DEFAULT_TARGET)
    parser.add_argument("--archive-directory", type=Path, default=DEFAULT_ARCHIVE)
    arguments = parser.parse_args()
    print(
        json.dumps(
            promote_dataset(
                arguments.source_export,
                arguments.target_seed,
                arguments.archive_directory,
            ),
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
