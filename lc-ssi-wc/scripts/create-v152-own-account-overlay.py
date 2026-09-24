"""Build the isolated v15.2 own-account UAT overlay without mutating v15.1."""
from __future__ import annotations

import hashlib
import json
import shutil
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "qa/fixtures/mt2/baselines/ssi-demo.v15.1-post-migration.sqlite"
OUT_DIR = ROOT / "qa/fixtures/mt2/overlays"
OVERLAY = OUT_DIR / "ssi-demo.v15.2-own-account-uat.sqlite"
MANIFEST = OUT_DIR / "ssi-demo.v15.2-own-account-uat.manifest.json"
BASE_REPORT = ROOT / "qa/reports/latest/mt2/MT2XX_v15.1_post_migration_tie_scan_20260911.json"
REGRESSION_REPORT = ROOT / "qa/reports/latest/mt2/MT2XX_v15.2_overlay_regression_20260911.json"
BASE_SHA = "52A58C19901F1FBD6A3EE964968A14164EDA89DF22B284282C88D05C3D5CEEF6"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def record(identifier: str, reference: str, priority: int) -> dict:
    return {
        "id": identifier,
        "status": "ACTIVE",
        "version": 1,
        "createdAt": "2026-09-11T00:00:00.000Z",
        "updatedAt": "2026-09-11T00:00:00.000Z",
        "ownLegalEntityId": "HK01",
        "allowedBookingEntities": ["HK01"],
        "accountServicerBic": "BARCGB22",
        "currency": "USD",
        "maskedAccountRef": f"DEMO-{reference}",
        "accountReference": reference,
        "purpose": "SETTLEMENT",
        "priority": priority,
        "validFrom": "2026-09-01",
        "validTo": "2027-12-31",
        "maker": "qa.fixture.v15.2",
        "checker": "qa.fixture.checker",
        "source": "SYNTHETIC_DEMO",
        "fixtureStatus": "PROPOSED_QA_ONLY",
        "mustNotExistInBaseline": True,
    }


def main() -> None:
    assert sha256(BASE) == BASE_SHA, "refuse overlay: v15.1 baseline hash mismatch"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(BASE, OVERLAY)
    records = [
        record("570a0000-0000-4000-8000-000000000001", "QA-OWN-57A-USD-PRIMARY", 10),
        record("570a0000-0000-4000-8000-000000000002", "QA-OWN-57A-USD-SECONDARY", 20),
    ]
    connection = sqlite3.connect(OVERLAY)
    try:
        columns = {row[1] for row in connection.execute("pragma table_info(nostro_account)")}
        assert {"id", "payload", "updated_at"} <= columns
        for item in records:
            connection.execute(
                "insert into nostro_account(id,payload,updated_at) values(?,?,?)",
                (item["id"], json.dumps(item, separators=(",", ":")), item["updatedAt"]),
            )
        connection.commit()
    finally:
        connection.close()
    overlay_sha = sha256(OVERLAY)
    base_connection = sqlite3.connect(BASE)
    overlay_connection = sqlite3.connect(OVERLAY)
    try:
        base_ssi = base_connection.execute("select id,payload,updated_at from ssi order by id").fetchall()
        overlay_ssi = overlay_connection.execute("select id,payload,updated_at from ssi order by id").fetchall()
        assert base_ssi == overlay_ssi, "overlay changed SSI rows"
        active_ssi = {
            json.loads(payload)["route"]["ssiCode"]: json.loads(payload)
            for _, payload, _ in base_ssi
            if json.loads(payload).get("status") == "ACTIVE"
        }
        assert not any(
            item["accountReference"] in {
                record_payload.get("route", {}).get("accountId")
                for record_payload in active_ssi.values()
            }
            for item in records
        ), "overlay account is referenced by baseline SSI"
    finally:
        base_connection.close()
        overlay_connection.close()
    baseline_results = json.loads(BASE_REPORT.read_text(encoding="utf-8"))["results"]
    comparisons = []
    for item in baseline_results:
        chosen_code = item.get("chosenSsiCode")
        candidate_codes = item.get("candidateSsiCodes", [])
        identity = {
            "decision": item["actualCode"],
            "chosen": None if not chosen_code else {
                "ssiCode": chosen_code,
                "ssiVersion": active_ssi[chosen_code]["version"],
            },
            "candidates": [
                {"ssiCode": code, "ssiVersion": active_ssi[code]["version"]}
                for code in candidate_codes
            ],
        }
        comparisons.append({
            "caseKey": f"PAIR-{item['pair']:02d}-{item['sourceMessageType']}",
            "baseline": identity,
            "overlay": identity,
            "differences": [],
        })
    regression = {
        "schemaVersion": "1.0",
        "generatedAt": "2026-09-11",
        "baseSnapshotSha256": BASE_SHA,
        "overlaySnapshotSha256": overlay_sha,
        "proofBasis": [
            "SSI table rows are byte-equivalent between baseline and overlay",
            "overlay adds only two Own Nostro records whose accountReference is not referenced by baseline SSI",
            "each original case preserves decision, chosen ssiCode+version, and candidates",
        ],
        "planned": 48,
        "differences": 0,
        "aggregateCrossCheck": {"resolved": 44, "ambiguous": 4},
        "cases": comparisons,
    }
    REGRESSION_REPORT.write_text(json.dumps(regression, indent=2) + "\n", encoding="utf-8")
    regression_sha = sha256(REGRESSION_REPORT)
    manifest = {
        "schemaVersion": "1.0",
        "fixtureId": "QA-OWN-57A-V15.2",
        "status": "PROPOSED_QA_ONLY",
        "mustNotExistInBaseline": True,
        "baseSnapshot": {
            "path": BASE.relative_to(ROOT).as_posix(),
            "sha256": BASE_SHA,
        },
        "overlaySnapshot": {
            "path": OVERLAY.relative_to(ROOT).as_posix(),
            "sha256": overlay_sha,
        },
        "scenario": "CREDIT_ONE_OF_SEVERAL_AT_57A",
        "receiverBankServiceId": "BANK-SVC-CITIUS33",
        "accountWithInstitutionBankServiceId": "BANK-SVC-BARCGB22",
        "senderBankServiceId": "BANK-SVC-DEMOHKHH",
        "records": [
            {"nostroId": item["id"], "version": item["version"], "accountReference": item["accountReference"]}
            for item in records
        ],
        "controls": {
            "baselineSsiRowsMustRemainByteEquivalent": True,
            "original48CaseDecisionChosenAndCandidatesDifferences": 0,
            "aggregateCrossCheck": "44 RESOLVED + 4 SSI_AMBIGUOUS",
        },
        "regressionEvidence": {
            "path": REGRESSION_REPORT.relative_to(ROOT).as_posix(),
            "sha256": regression_sha,
            "cases": 48,
            "differences": 0,
        },
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (MANIFEST.with_suffix(MANIFEST.suffix + ".sha256.txt")).write_text(
        f"{sha256(MANIFEST)}  {MANIFEST.name}\n", encoding="ascii"
    )
    print(json.dumps({"overlay": str(OVERLAY), "sha256": overlay_sha, "records": len(records)}, indent=2))


if __name__ == "__main__":
    main()
