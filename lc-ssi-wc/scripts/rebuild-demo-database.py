"""Export and rebuild the canonical synthetic SSI demo database.

The checked-in JSON seed is the single source of truth for the default demo DB.
Historical baselines and deliberately-invalid data-quality fixtures are separate.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import sqlite3
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = (
    ROOT
    / "qa/mt2/mt2-final/fixtures/overlays/ssi-demo.v15.3-unified-qa-uat.sqlite"
)
DEFAULT_SEED = ROOT / "fixtures/ssi-demo.v15.3.canonical.seed.json"
DEFAULT_TARGET = ROOT / "data/ssi-demo.sqlite"
IDENTITY_METHOD = "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1"

PERFORMANCE_INDEXES = (
    """CREATE INDEX IF NOT EXISTS idx_nostro_eligibility_scope_v2 ON nostro_account(
      json_extract(payload,'$.status'),
      json_extract(payload,'$.fixtureFamily'),
      json_extract(payload,'$.accountServicerBic'),
      json_extract(payload,'$.currency'),
      json_extract(payload,'$.purpose'),
      json_extract(payload,'$.validFrom'),
      json_extract(payload,'$.validTo'),
      CAST(json_extract(payload,'$.priority') AS INTEGER),
      json_extract(payload,'$.usageGroup')
    )""",
    """CREATE INDEX IF NOT EXISTS idx_rma_authorisation_scope_v2 ON rma_authorisation(
      json_extract(payload,'$.fixtureFamily'),
      CASE WHEN length(trim(json_extract(payload,'$.ownBic')))=8
        THEN trim(json_extract(payload,'$.ownBic')) || 'XXX'
        ELSE trim(json_extract(payload,'$.ownBic')) END,
      CASE WHEN length(trim(json_extract(payload,'$.counterpartyBic')))=8
        THEN trim(json_extract(payload,'$.counterpartyBic')) || 'XXX'
        ELSE trim(json_extract(payload,'$.counterpartyBic')) END,
      json_extract(payload,'$.service'),
      json_extract(payload,'$.direction'),
      json_extract(payload,'$.status'),
      json_extract(payload,'$.validFrom'),
      json_extract(payload,'$.validTo'),
      json_extract(payload,'$.usageGroup')
    )""",
)


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def encode(value: Any) -> Any:
    if isinstance(value, bytes):
        return {"$base64": base64.b64encode(value).decode("ascii")}
    return value


def decode(value: Any) -> Any:
    if isinstance(value, dict) and set(value) == {"$base64"}:
        return base64.b64decode(value["$base64"])
    return value


def logical_snapshot(connection: sqlite3.Connection) -> str:
    tables = connection.execute(
        "SELECT name,sql FROM sqlite_schema "
        "WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).fetchall()
    snapshot: list[dict[str, Any]] = []
    for name, sql in tables:
        columns = [row[1] for row in connection.execute(f'PRAGMA table_info("{name}")')]
        quoted = ", ".join(f'"{column}"' for column in columns)
        rows = []
        for values in connection.execute(
            f'SELECT {quoted} FROM "{name}" ORDER BY {quoted}'
        ).fetchall():
            rows.append(
                {column: encode(value) for column, value in zip(columns, values, strict=True)}
            )
        snapshot.append({"name": name, "sql": sql, "columns": columns, "rows": rows})
    body = {"method": IDENTITY_METHOD, "tables": snapshot}
    return hashlib.sha256(canonical_json(body).encode("utf-8")).hexdigest().upper()


def export_seed(
    source_path: Path,
    seed_path: Path,
    fixture_id: str = "SSI-DEMO-V15.3-CANONICAL",
) -> dict[str, Any]:
    source = sqlite3.connect(f"file:{source_path.as_posix()}?mode=ro", uri=True)
    try:
        source.execute("BEGIN")
        integrity = source.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise AssertionError(f"source integrity check failed: {integrity}")
        schema_objects = [
            {"type": kind, "name": name, "table": table_name, "sql": sql}
            for kind, name, table_name, sql in source.execute(
                "SELECT type,name,tbl_name,sql FROM sqlite_schema "
                "WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' "
                "ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,name"
            )
        ]
        tables: dict[str, Any] = {}
        for item in (row for row in schema_objects if row["type"] == "table"):
            name = item["name"]
            columns = [
                row[1] for row in source.execute(f'PRAGMA table_info("{name}")')
            ]
            quoted = ", ".join(f'"{column}"' for column in columns)
            rows = [
                [encode(value) for value in values]
                for values in source.execute(
                    f'SELECT {quoted} FROM "{name}" ORDER BY {quoted}'
                ).fetchall()
            ]
            tables[name] = {"columns": columns, "rows": rows}
        logical_sha = logical_snapshot(source)
        source.execute("ROLLBACK")
    finally:
        source.close()

    seed = {
        "schemaVersion": "1.0",
        "fixtureId": fixture_id,
        "classification": "SYNTHETIC_DEMO_QA_UAT",
        "warning": "Fictional test data only. Never use for production payments.",
        "identityMethod": IDENTITY_METHOD,
        "source": {
            "path": source_path.relative_to(ROOT).as_posix(),
            "logicalSha256": logical_sha,
        },
        "schema": schema_objects,
        "tables": tables,
    }
    seed_path.parent.mkdir(parents=True, exist_ok=True)
    seed_path.write_text(json.dumps(seed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {
        "seed": seed_path.relative_to(ROOT).as_posix(),
        "seedSha256": sha256(seed_path),
        "logicalSha256": logical_sha,
        "tables": {name: len(value["rows"]) for name, value in tables.items()},
    }


def rebuild(seed_path: Path, target_path: Path) -> dict[str, Any]:
    seed = json.loads(seed_path.read_text(encoding="utf-8"))
    if seed.get("classification") != "SYNTHETIC_DEMO_QA_UAT":
        raise AssertionError("refuse rebuild from a non-demo seed")
    expected_logical_sha = seed["source"]["logicalSha256"]
    target_path.parent.mkdir(parents=True, exist_ok=True)
    if target_path.exists():
        target_path.unlink()
    for suffix in ("-wal", "-shm"):
        sidecar = Path(f"{target_path}{suffix}")
        if sidecar.exists():
            sidecar.unlink()

    target = sqlite3.connect(target_path)
    try:
        target.execute("PRAGMA journal_mode=DELETE")
        target.execute("BEGIN IMMEDIATE")
        for item in seed["schema"]:
            if item["type"] == "table":
                target.execute(item["sql"])
        for table_name, table in seed["tables"].items():
            columns = table["columns"]
            quoted_columns = ",".join(f'"{column}"' for column in columns)
            placeholders = ",".join("?" for _ in columns)
            statement = (
                f'INSERT INTO "{table_name}" ({quoted_columns}) VALUES ({placeholders})'
            )
            target.executemany(
                statement,
                ([decode(value) for value in row] for row in table["rows"]),
            )
        for item in seed["schema"]:
            if item["type"] != "table":
                target.execute(item["sql"])
        for statement in PERFORMANCE_INDEXES:
            target.execute(statement)
        target.execute("COMMIT")
        target.execute("VACUUM")
        integrity = target.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise AssertionError(f"rebuilt integrity check failed: {integrity}")
        actual_logical_sha = logical_snapshot(target)
        if actual_logical_sha != expected_logical_sha:
            raise AssertionError(
                f"logical identity mismatch: {actual_logical_sha} != {expected_logical_sha}"
            )
    except Exception:
        if target.in_transaction:
            target.execute("ROLLBACK")
        raise
    finally:
        target.close()

    return {
        "target": target_path.relative_to(ROOT).as_posix(),
        "bytes": target_path.stat().st_size,
        "physicalSha256": sha256(target_path),
        "logicalSha256": expected_logical_sha,
        "seedSha256": sha256(seed_path),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    export_parser = subparsers.add_parser("export")
    export_parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    export_parser.add_argument("--seed", type=Path, default=DEFAULT_SEED)
    rebuild_parser = subparsers.add_parser("rebuild")
    rebuild_parser.add_argument("--seed", type=Path, default=DEFAULT_SEED)
    rebuild_parser.add_argument("--target", type=Path, default=DEFAULT_TARGET)
    args = parser.parse_args()
    result = (
        export_seed(args.source.resolve(), args.seed.resolve())
        if args.command == "export"
        else rebuild(args.seed.resolve(), args.target.resolve())
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
