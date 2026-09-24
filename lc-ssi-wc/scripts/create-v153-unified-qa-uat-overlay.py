"""Build the governed v15.3 QA/UAT overlay without mutating earlier snapshots."""
from __future__ import annotations

import base64
import hashlib
import json
import sqlite3
import uuid
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "qa/fixtures/mt2/overlays/ssi-demo.v15.2-own-account-uat.sqlite"
OUT_DIR = ROOT / "qa/fixtures/mt2/overlays"
OVERLAY = OUT_DIR / "ssi-demo.v15.3-unified-qa-uat.sqlite"
MANIFEST = OUT_DIR / "ssi-demo.v15.3-unified-qa-uat.manifest.json"
PLAN = ROOT / "qa/reports/latest/mt2/MT2XX_v15.3_migration_expected_20260912.json"
BASE_RESULTS = ROOT / "qa/reports/latest/mt2/MT2XX_v15.1_post_migration_tie_scan_20260911.json"
TIMESTAMP = "2026-09-12T00:00:00.000Z"
IDENTITY_METHOD = "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1"
NAMESPACE = uuid.UUID("6c0ac631-937c-4abd-9018-a85b6c44d153")

GENERIC_APPLICABILITY = {
    "consumer": "CENTRAL_PAYMENT",
    "product": "CENTRAL_PAYMENT",
    "businessFunction": "INTERBANK_TRANSFER",
    "paymentLeg": "INTERBANK_SETTLEMENT",
    "direction": "OUTBOUND",
}

# BA-approved primary route per formal UAT group. USD Barclays/JPM use the
# standard Citi primary Nostro while retaining their counterparty identity.
ROUTES = [
    (1, "CITIUS33", "USD", "SSI-DEMO-001", "DEMO-NOSTRO-001-PRIMARY"),
    (2, "BARCGB22", "GBP", "SSI-DEMO-003", "DEMO-NOSTRO-002-PRIMARY"),
    (3, "BARCGB22", "USD", "SSI-DEMO-024", "DEMO-NOSTRO-001-PRIMARY"),
    (4, "DEUTDEFF", "EUR", "SSI-DEMO-005", "DEMO-NOSTRO-003-PRIMARY"),
    (5, "DBSSSGSG", "SGD", "SSI-DEMO-007", "DEMO-NOSTRO-004-PRIMARY"),
    (6, "BOTKJPJT", "JPY", "SSI-DEMO-009", "DEMO-NOSTRO-005-PRIMARY"),
    (7, "HSBCHKHH", "HKD", "SSI-DEMO-011", "DEMO-NOSTRO-006-PRIMARY"),
    (8, "BOFAUS3N", "AUD", "SSI-DEMO-013", "DEMO-NOSTRO-007-PRIMARY"),
    (9, "CHASUS33", "CAD", "SSI-DEMO-015", "DEMO-NOSTRO-008-PRIMARY"),
    (10, "CHASUS33", "USD", "SSI-DEMO-021", "DEMO-NOSTRO-001-PRIMARY"),
    (11, "SCBLGB2L", "CHF", "SSI-DEMO-017", "DEMO-NOSTRO-009-PRIMARY"),
    (12, "BNPAFRPP", "CNY", "SSI-DEMO-019", "DEMO-NOSTRO-010-PRIMARY"),
]


def deterministic_uuid(label: str) -> str:
    return str(uuid.uuid5(NAMESPACE, label))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def logical_snapshot(connection: sqlite3.Connection) -> str:
    tables = connection.execute(
        "SELECT name, sql FROM sqlite_schema "
        "WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).fetchall()
    snapshot = []
    for name, sql in tables:
        columns = [row[1] for row in connection.execute(f'PRAGMA table_info("{name}")')]
        quoted = ", ".join(f'"{column}"' for column in columns)
        rows = []
        for values in connection.execute(
            f'SELECT {quoted} FROM "{name}" ORDER BY {quoted}'
        ).fetchall():
            row = {}
            for column, value in zip(columns, values, strict=True):
                row[column] = (
                    {"base64": base64.b64encode(value).decode("ascii")}
                    if isinstance(value, bytes)
                    else value
                )
            rows.append(row)
        snapshot.append({"name": name, "sql": sql, "columns": columns, "rows": rows})
    body = {"method": IDENTITY_METHOD, "tables": snapshot}
    return hashlib.sha256(canonical_json(body).encode("utf-8")).hexdigest().upper()


def current_active_ssis(connection: sqlite3.Connection) -> dict[str, dict[str, Any]]:
    current: dict[str, dict[str, Any]] = {}
    for (payload_text,) in connection.execute("SELECT payload FROM ssi"):
        payload = json.loads(payload_text)
        code = payload.get("route", {}).get("ssiCode")
        if not code or payload.get("status") != "ACTIVE":
            continue
        if code not in current or int(payload.get("version", 0)) > int(current[code].get("version", 0)):
            current[code] = payload
    return current


def is_generic_applicability(payload: dict[str, Any]) -> bool:
    return payload.get("status") == "ACTIVE" and all(
        payload.get(key) == value for key, value in GENERIC_APPLICABILITY.items()
    )


def primary_nostro(
    connection: sqlite3.Connection, reference: str, servicer: str, currency: str
) -> dict[str, Any]:
    matches = []
    for (payload_text,) in connection.execute("SELECT payload FROM nostro_account"):
        payload = json.loads(payload_text)
        if (
            payload.get("status") == "ACTIVE"
            and payload.get("accountReference") == reference
            and payload.get("accountServicerBic") == servicer
            and payload.get("currency") == currency
        ):
            matches.append(payload)
    if not matches:
        raise AssertionError(f"missing ACTIVE Nostro {reference}/{servicer}/{currency}")
    return min(
        matches,
        key=lambda item: (int(item.get("priority", 999)), -int(item.get("version", 0))),
    )


def insert_audit(connection: sqlite3.Connection, subject: str, action: str, payload: Any) -> None:
    connection.execute(
        "INSERT INTO audit_event(ssi_id,action,actor,payload,occurred_at) VALUES(?,?,?,?,?)",
        (subject, action, "ba.approved.v15.3.migration", canonical_json(payload), TIMESTAMP),
    )


def make_generic_ssi(
    template: dict[str, Any], pair: int, bic: str, currency: str, account: str
) -> dict[str, Any]:
    identifier = deterministic_uuid(f"generic-ssi-{pair}-{bic}-{currency}")
    route = dict(template["route"])
    code = f"SSI-UAT-GEN-{pair:02d}"
    route.update(
        {
            "ssiCode": code,
            "ssiName": f"{currency} Generic Interbank Transfer for {bic}",
            "applicabilityProfileId": f"APPL-CENTRAL-PAYMENT-INTERBANK-TRANSFER-{bic}-{currency}",
            "accountId": account,
            "businessFunction": "INTERBANK_TRANSFER",
            "consumer": "CENTRAL_PAYMENT",
            "product": "CENTRAL_PAYMENT",
            "paymentLeg": "INTERBANK_SETTLEMENT",
            "direction": "OUTBOUND",
            "routePurpose": "INTERBANK_TRANSFER",
            "sampleSet": "PROPOSED_QA_UAT_ONLY",
            "messageTypes": "pacs.009.001.12,pacs.009.001.08",
            "businessService": "swift.cbprplus.04,swift.cbprplus.cov.04",
            "sourceMessageTypes": "MT202,MT205,MT202COV,MT205COV",
            "routePreference": "PRIMARY",
            "priority": "10",
            "resolutionReason": "BA-approved exact-purpose generic interbank transfer route",
        }
    )
    route["beneficiaryBic"] = bic
    return {
        "id": identifier,
        "counterpartyId": f"CP-{bic}",
        "scope": "STANDING",
        "maker": "qa.fixture.v15.3",
        "checker": "ba.approved.v15.3",
        "ownershipType": "COUNTERPARTY",
        "ownerParty": bic,
        "publisherParty": bic,
        "route": route,
        "status": "ACTIVE",
        "version": 1,
        "createdAt": TIMESTAMP,
        "updatedAt": TIMESTAMP,
    }


def make_applicability(ssi_id: str) -> dict[str, Any]:
    return {
        **GENERIC_APPLICABILITY,
        "status": "ACTIVE",
        "validFrom": "2026-01-01",
        "validTo": "2027-12-31",
        "id": f"{ssi_id}:APPL:1",
        "ssiId": ssi_id,
        "version": 1,
        "createdAt": TIMESTAMP,
        "updatedAt": TIMESTAMP,
    }


def tie_nostro(index: int) -> dict[str, Any]:
    identifier = deterministic_uuid(f"tie-nostro-{index}")
    return {
        "id": identifier,
        "ownLegalEntityId": "HK01",
        "allowedBookingEntities": ["HK01"],
        "accountServicerBic": "BARCGB22",
        "currency": "GBP",
        "maskedAccountRef": f"QA-TIE-GBP-{index}-MASKED",
        "accountReference": f"QA-TIE-GBP-{index}",
        "purpose": "SETTLEMENT",
        "priority": 10,
        "validFrom": "2026-01-01",
        "validTo": "2027-12-31",
        "maker": "qa.fixture.v15.3",
        "checker": "ba.approved.v15.3",
        "source": "SYNTHETIC_DEMO",
        "status": "ACTIVE",
        "version": 1,
        "createdAt": TIMESTAMP,
        "updatedAt": TIMESTAMP,
        "fixtureStatus": "PROPOSED_QA_ONLY",
        "usageGroup": "QA_AMBIGUITY_FIXTURE",
    }


def make_tie_ssi(template: dict[str, Any], index: int, account: str) -> dict[str, Any]:
    payload = make_generic_ssi(template, 90 + index, "QATIGB2L", "GBP", account)
    payload["id"] = deterministic_uuid(f"tie-ssi-{index}")
    payload["counterpartyId"] = "CP-QATIGB2L"
    payload["ownerParty"] = "QATIGB2L"
    payload["publisherParty"] = "QATIGB2L"
    payload["route"].update(
        {
            "ssiCode": f"SSI-QA-TIE-{index}",
            "ssiName": f"GBP QA Ambiguity Control Route {index}",
            "applicabilityProfileId": "APPL-QA-TIE-INTERBANK-TRANSFER-GBP",
            "settlementRouteId": "ROUTE-QA-TIE-GBP-BARCGB22",
            "counterpartyName": "QA Tie-Control Bank",
            "counterpartyBic": "QATIGB2L",
            "counterpartyCountry": "GB",
            "beneficiaryBic": "QATIGB2L",
            "beneficiaryBankCountry": "GB",
            "accountWithBic": "BARCGB22",
            "actualReceiverBic": "BARCGB22",
            "bic": "BARCGB22",
            "bankName": "Barclays Bank PLC",
            "country": "GB",
            "sampleSet": "PROPOSED_QA_ONLY",
            "fixtureStatus": "PROPOSED_QA_ONLY",
            "usageGroup": "QA_AMBIGUITY_FIXTURE",
            "routeType": "CLEARING_AGENT",
        }
    )
    return payload


def add_tie_rma(connection: sqlite3.Connection) -> dict[str, Any]:
    identifier = deterministic_uuid("tie-rma-finplus-outbound")
    payload = {
        "id": identifier,
        "ownBic": "DEMOHKHH",
        "counterpartyBic": "QATIGB2L",
        "service": "FINPLUS",
        "direction": "OUTBOUND",
        "messageTypes": ["pacs.009.001.12", "pacs.009.001.08"],
        "businessServices": ["swift.cbprplus.04", "swift.cbprplus.cov.04"],
        "validFrom": "2026-09-12",
        "validTo": "2027-12-31",
        "maker": "qa.fixture.v15.3",
        "checker": "ba.approved.v15.3",
        "source": "SYNTHETIC_DEMO",
        "status": "ACTIVE",
        "version": 1,
        "createdAt": TIMESTAMP,
        "updatedAt": TIMESTAMP,
        "fixtureStatus": "PROPOSED_QA_ONLY",
    }
    connection.execute(
        "INSERT INTO rma_authorisation(id,payload,updated_at) VALUES(?,?,?)",
        (identifier, canonical_json(payload), TIMESTAMP),
    )
    return payload


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    source = sqlite3.connect(SOURCE)
    source.execute("BEGIN")
    try:
        source_logical_sha = logical_snapshot(source)
        if OVERLAY.exists():
            OVERLAY.unlink()
        target = sqlite3.connect(OVERLAY)
        source.backup(target)
    finally:
        source.execute("ROLLBACK")
        source.close()

    removed: list[dict[str, Any]] = []
    created: list[dict[str, Any]] = []
    try:
        target.execute("BEGIN IMMEDIATE")
        current = current_active_ssis(target)
        active_ids = {payload["id"] for payload in current.values()}
        for app_id, ssi_id, payload_text in target.execute(
            "SELECT id,ssi_id,payload FROM ssi_applicability ORDER BY id"
        ).fetchall():
            app = json.loads(payload_text)
            if ssi_id in active_ids and is_generic_applicability(app):
                target.execute("DELETE FROM ssi_applicability WHERE id=?", (app_id,))
                removed.append({"applicabilityId": app_id, "ssiId": ssi_id})
                insert_audit(target, ssi_id, "GENERIC_APPLICABILITY_REMOVED", app)
        if len(removed) != 26:
            raise AssertionError(
                f"expected 26 current generic applicability removals, got {len(removed)}"
            )

        for pair, bic, currency, template_code, account in ROUTES:
            template = current[template_code]
            servicer = str(template["route"].get("accountWithBic", ""))
            primary_nostro(target, account, servicer, currency)
            record = make_generic_ssi(template, pair, bic, currency, account)
            app = make_applicability(record["id"])
            target.execute(
                "INSERT INTO ssi(id,payload,updated_at) VALUES(?,?,?)",
                (record["id"], canonical_json(record), TIMESTAMP),
            )
            target.execute(
                "INSERT INTO ssi_applicability(id,ssi_id,payload,updated_at) VALUES(?,?,?,?)",
                (app["id"], record["id"], canonical_json(app), TIMESTAMP),
            )
            insert_audit(target, record["id"], "GENERIC_SSI_CREATED", record)
            created.append(
                {
                    "pair": pair,
                    "counterpartyBic": bic,
                    "currency": currency,
                    "ssiId": record["id"],
                    "ssiCode": record["route"]["ssiCode"],
                    "ssiVersion": 1,
                    "accountReference": account,
                    "actualReceiverBic": record["route"].get("actualReceiverBic"),
                }
            )

        tie_accounts = [tie_nostro(1), tie_nostro(2)]
        for account in tie_accounts:
            target.execute(
                "INSERT INTO nostro_account(id,payload,updated_at) VALUES(?,?,?)",
                (account["id"], canonical_json(account), TIMESTAMP),
            )
        tie_records = []
        barclays_template = current["SSI-DEMO-003"]
        for index, account in enumerate(tie_accounts, start=1):
            record = make_tie_ssi(barclays_template, index, account["accountReference"])
            app = make_applicability(record["id"])
            target.execute(
                "INSERT INTO ssi(id,payload,updated_at) VALUES(?,?,?)",
                (record["id"], canonical_json(record), TIMESTAMP),
            )
            target.execute(
                "INSERT INTO ssi_applicability(id,ssi_id,payload,updated_at) VALUES(?,?,?,?)",
                (app["id"], record["id"], canonical_json(app), TIMESTAMP),
            )
            insert_audit(target, record["id"], "QA_TIE_SSI_CREATED", record)
            tie_records.append(
                {
                    "ssiId": record["id"],
                    "ssiCode": record["route"]["ssiCode"],
                    "ssiVersion": 1,
                    "accountReference": account["accountReference"],
                    "priority": 10,
                    "routePreference": "PRIMARY",
                    "specificity": "NAMED_COUNTERPARTY",
                }
            )
        rma = add_tie_rma(target)
        target.execute(
            "INSERT INTO outbox(event_id,event_type,payload,status,created_at) VALUES(?,?,?,?,?)",
            (
                deterministic_uuid("v15.3-migration-outbox"),
                "QA_UAT_OVERLAY_V15_3_CREATED",
                canonical_json({"genericRoutes": created, "tieRoutes": tie_records}),
                "PENDING",
                TIMESTAMP,
            ),
        )
        target.execute("COMMIT")
        target.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        integrity = target.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise AssertionError(f"SQLite integrity check failed: {integrity}")
        overlay_logical_sha = logical_snapshot(target)
    except Exception:
        if target.in_transaction:
            target.execute("ROLLBACK")
        raise
    finally:
        target.close()

    source_manifest = SOURCE.with_suffix(".manifest.json")
    base_results = json.loads(BASE_RESULTS.read_text(encoding="utf-8"))["results"]
    routes_by_pair = {item["pair"]: item for item in created}
    planned_cases = []
    for result in base_results:
        chosen = routes_by_pair[result["pair"]]
        planned_cases.append(
            {
                "caseKey": f"PAIR-{result['pair']:02d}-{result['sourceMessageType']}",
                "counterpartyBic": result["counterpartyBic"],
                "currency": result["currency"],
                "expectedDecision": "SSI_RESOLVED",
                "expectedSsiCode": chosen["ssiCode"],
                "expectedSsiVersion": chosen["ssiVersion"],
                "expectedAccountReference": chosen["accountReference"],
                "expectedRoutePurpose": "INTERBANK_TRANSFER",
                "expectedSelectedBy": "EXACT_BUSINESS_PURPOSE_MATCH",
            }
        )
    plan = {
        "schemaVersion": "1.0",
        "status": "BA_APPROVED_EXPECTATION",
        "generatedAt": TIMESTAMP,
        "sourceLogicalSnapshotSha256": source_logical_sha,
        "overlayLogicalSnapshotSha256": overlay_logical_sha,
        "formalUat": {
            "planned": 48,
            "expectedResolved": 48,
            "expectedAmbiguous": 0,
            "expectedProfileIncomplete": 0,
            "cases": planned_cases,
        },
        "qaAmbiguityControls": {
            "planned": 4,
            "counterpartyBic": "QATIGB2L",
            "currency": "GBP",
            "journeys": ["MT202", "MT202COV", "MT205", "MT205COV"],
            "expectedStatus": 422,
            "expectedDecision": "SSI_AMBIGUOUS",
            "expectedCandidates": tie_records,
        },
    }
    PLAN.write_text(json.dumps(plan, indent=2) + "\n", encoding="utf-8")
    manifest = {
        "schemaVersion": "1.0",
        "fixtureId": "QA-UAT-EC-PURPOSE-01-V15.3",
        "status": "PROPOSED_QA_UAT_ONLY",
        "baDecision": "APPROVED",
        "identityMethod": IDENTITY_METHOD,
        "sourceSnapshot": {
            "path": SOURCE.relative_to(ROOT).as_posix(),
            "physicalSha256": sha256(SOURCE),
            "logicalSha256": source_logical_sha,
            "manifestPath": source_manifest.relative_to(ROOT).as_posix(),
            "manifestSha256": sha256(source_manifest),
        },
        "overlaySnapshot": {
            "path": OVERLAY.relative_to(ROOT).as_posix(),
            "physicalSha256": sha256(OVERLAY),
            "logicalSha256": overlay_logical_sha,
            "bytes": OVERLAY.stat().st_size,
        },
        "migration": {
            "rule": "EC-PURPOSE-01",
            "atomic": True,
            "removedGenericApplicability": removed,
            "createdGenericRoutes": created,
            "excludedFromGeneric": [
                {"ssiCode": "SSI-DEMO-035", "reason": "EURO1_SCHEME_SPECIFIC"},
                {"ssiCode": "SSI-DEMO-041", "reason": "LIMITED_NEGATIVE_ONLY"},
                {"ssiCode": "SSI-DEMO-042", "reason": "LIMITED_NEGATIVE_ONLY"},
            ],
        },
        "qaTieFixture": {
            "counterpartyBic": "QATIGB2L",
            "currency": "GBP",
            "classification": "PROPOSED_QA_ONLY",
            "usageGroup": "QA_AMBIGUITY_FIXTURE",
            "records": tie_records,
            "nostroRecords": [
                {
                    "nostroId": item["id"],
                    "version": item["version"],
                    "accountReference": item["accountReference"],
                }
                for item in tie_accounts
            ],
            "rmaId": rma["id"],
        },
        "acceptancePlan": {
            "path": PLAN.relative_to(ROOT).as_posix(),
            "sha256": sha256(PLAN),
            "formalCases": 48,
            "tieControls": 4,
            "requiresPerCaseComparison": True,
        },
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    MANIFEST.with_suffix(MANIFEST.suffix + ".sha256.txt").write_text(
        f"{sha256(MANIFEST)}  {MANIFEST.name}\n", encoding="ascii"
    )
    print(
        json.dumps(
            {
                "overlay": str(OVERLAY),
                "physicalSha256": sha256(OVERLAY),
                "logicalSha256": overlay_logical_sha,
                "removedApplicability": len(removed),
                "genericRoutes": len(created),
                "tieRoutes": len(tie_records),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
