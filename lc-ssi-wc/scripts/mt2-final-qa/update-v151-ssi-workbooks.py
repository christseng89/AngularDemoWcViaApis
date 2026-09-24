from __future__ import annotations

import hashlib
import json
import sqlite3
from copy import copy
from pathlib import Path

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[2]
FILES = (
    ROOT / "qa/tdd/mt2/MT2XX_測試案例_SSI與NOSTRO_v6.xlsx",
    ROOT / "qa/fixtures/mt2/MT2XX_測試案例_SSI與NOSTRO_v6.xlsx",
)
SNAPSHOT = ROOT / "qa/fixtures/mt2/baselines/ssi-demo.v15.1-post-migration.sqlite"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def active_ssi() -> dict[str, dict]:
    connection = sqlite3.connect(f"file:{SNAPSHOT.as_posix()}?mode=ro&immutable=1", uri=True)
    records = {}
    for (payload,) in connection.execute("select payload from ssi"):
        record = json.loads(payload)
        if record.get("status") == "ACTIVE":
            records[record["route"]["ssiCode"]] = record
    connection.close()
    return records


def copy_column_style(sheet, source_column: int, target_column: int) -> None:
    sheet.column_dimensions[sheet.cell(1, target_column).column_letter].width = (
        sheet.column_dimensions[sheet.cell(1, source_column).column_letter].width
    )
    for row in range(1, sheet.max_row + 1):
        source = sheet.cell(row, source_column)
        target = sheet.cell(row, target_column)
        if source.has_style:
            target._style = copy(source._style)
        target.font = copy(source.font)
        target.fill = copy(source.fill)
        target.border = copy(source.border)
        target.alignment = copy(source.alignment)
        target.number_format = source.number_format
        target.protection = copy(source.protection)


def update_sheet(sheet, records: dict[str, dict]) -> set[str]:
    headers = {cell.value: cell.column for cell in sheet[1]}
    for header in ("businessService", "sourceMessageTypes"):
        if header not in headers:
            column = sheet.max_column + 1
            copy_column_style(sheet, column - 1, column)
            sheet.cell(1, column).value = header
            headers[header] = column
    seen = set()
    for row in range(2, sheet.max_row + 1):
        code = sheet.cell(row, headers["ssiCode"]).value
        if code not in records:
            continue
        record = records[code]
        route = record["route"]
        seen.add(code)
        sheet.cell(row, headers["id"]).value = record["id"]
        sheet.cell(row, headers["status"]).value = record["status"]
        sheet.cell(row, headers["version"]).value = record["version"]
        sheet.cell(row, headers["messageTypes raw"]).value = route.get("messageTypes", "")
        sheet.cell(row, headers["ownershipType key present"]).value = (
            "YES" if "ownershipType" in record else "NO"
        )
        sheet.cell(row, headers["ownershipType raw"]).value = record.get("ownershipType", "")
        sheet.cell(row, headers["businessService"]).value = route.get("businessService", "")
        sheet.cell(row, headers["sourceMessageTypes"]).value = route.get("sourceMessageTypes", "")
    return seen


def append_audit_row(sheet, check: str, affected: int, population: int, evidence: str, method: str) -> None:
    for row in range(2, sheet.max_row + 1):
        if sheet.cell(row, 1).value == check:
            target = row
            break
    else:
        target = sheet.max_row + 1
        for column in range(1, sheet.max_column + 1):
            source = sheet.cell(target - 1, column)
            cell = sheet.cell(target, column)
            if source.has_style:
                cell._style = copy(source._style)
            cell.font = copy(source.font)
            cell.fill = copy(source.fill)
            cell.border = copy(source.border)
            cell.alignment = copy(source.alignment)
    for column, value in enumerate((check, affected, population, evidence, method), 1):
        sheet.cell(target, column).value = value


def update(source: Path, destination: Path) -> None:
    records = active_ssi()
    workbook = load_workbook(source)
    seen = set()
    for name in ("Bank Counterparty SSI", "Customer SSI Negative"):
        seen.update(update_sheet(workbook[name], records))
    if seen != set(records):
        raise RuntimeError(f"Workbook SSI inventory mismatch: missing={sorted(set(records) - seen)}")
    audit = workbook["Source Fidelity Audit"]
    cov = [
        record["route"]["ssiCode"]
        for record in records.values()
        if "swift.cbprplus.cov.04" in record["route"].get("businessService", "").split(",")
    ]
    append_audit_row(
        audit,
        "ACTIVE SSI with explicit COV businessService and source allow-list",
        len(cov),
        len(records),
        ",".join(sorted(cov)),
        "Exact businessService token swift.cbprplus.cov.04 plus MT202COV and MT205COV in sourceMessageTypes",
    )
    workbook.save(destination)


def main() -> None:
    if digest(FILES[0]) != digest(FILES[1]):
        raise RuntimeError("QA workbook copies diverged before v15.1 refresh")
    temporary = FILES[0].with_suffix(".v151.tmp.xlsx")
    update(FILES[0], temporary)
    payload = temporary.read_bytes()
    temporary.unlink()
    for destination in FILES:
        destination.write_bytes(payload)
        destination.with_suffix(".sha256.txt").write_text(
            f"{digest(destination)}  {destination.name}\n", encoding="utf-8"
        )
    print(json.dumps({
        "status": "UPDATED",
        "sha256": digest(FILES[0]),
        "bytes": FILES[0].stat().st_size,
        "copiesIdentical": digest(FILES[0]) == digest(FILES[1]),
    }, indent=2))


if __name__ == "__main__":
    main()
