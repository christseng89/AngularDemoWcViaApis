"""Add deterministic MT2 UI/QA route coverage to the canonical demo seed."""
from __future__ import annotations

import importlib.util
import json
import sqlite3
import uuid
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / "qa/FIX_DATA/reload-test-data/ssi-demo.v15.8.pacs009-repaired-isolated.canonical.seed.json"
FIXTURE_MANIFEST = (
    ROOT / "parameters/resolution-page-fixtures.mt2-pacs009.sr2026.json"
)
OVERLAY = (
    ROOT
    / "qa/mt2/mt2-final/fixtures/overlays/ssi-demo.v15.3-mt2-ui-parity-v1.sqlite"
)
TIMESTAMP = "2026-09-15T00:00:00.000Z"
FIXTURE_FAMILY = "MT2-UI-PARITY-V1"
FIXTURE_MAKER = "qa.fixture.mt2.ui-parity.v1"
FIXTURE_CHECKER = "ba.approved.mt2.ui-parity.v1"
NAMESPACE = uuid.UUID("49d70dc8-0588-44dd-921a-b784ad195ef1")

CURRENCY_RECEIVERS = {
    "AUD": ["CTBAAU2S", "ANZBAU3M", "CITIUS33"],
    "CAD": ["ROYCCAT2", "BOFMCAM2", "CITIUS33"],
    "CHF": ["UBSWCHZH80A", "CRESCHZZ80A", "DEUTDEFF"],
    "CNY": ["BKCHCNBJ", "HSBCHKHH", "CITIUS33"],
    "EUR": ["DEUTDEFF", "HSBCHKHH", "CITIUS33"],
    "GBP": ["BARCGB22", "SCBLGB2L", "CITIUS33"],
    "HKD": ["HSBCHKHH", "SCBLHKHH", "CITIUS33"],
    "JPY": ["BOTKJPJT", "SMBCJPJT", "CITIUS33"],
    "SGD": ["DBSSSGSG", "OCBCSGSG", "CITIUS33"],
    "USD": ["CITIUS33", "CHASUS33", "BARCGB22"],
}


def deterministic_uuid(label: str) -> str:
    return str(uuid.uuid5(NAMESPACE, label))


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def load_rebuild_module():
    path = ROOT / "scripts/rebuild-demo-database.py"
    spec = importlib.util.spec_from_file_location("rebuild_demo_database", path)
    if spec is None or spec.loader is None:
        raise AssertionError("cannot load canonical database utility")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_required_banks() -> tuple[dict[str, dict[str, Any]], set[str]]:
    banks_document = json.loads(
        (ROOT / "parameters/bank-services.json").read_text(encoding="utf-8")
    )
    banks = {item["bic"]: item for item in banks_document["items"]}
    required_bics = {bic for values in CURRENCY_RECEIVERS.values() for bic in values}
    missing_bics = sorted(required_bics - banks.keys())
    if missing_bics:
        raise AssertionError(f"bank directory is missing BICs: {missing_bics}")
    return banks, required_bics


def load_operational_fixture_bindings() -> list[str]:
    document = json.loads(FIXTURE_MANIFEST.read_text(encoding="utf-8"))
    bindings = sorted(
        item["bindingId"]
        for item in document["bindings"]
        if item["polarity"] == "POSITIVE"
    )
    if not bindings or len(bindings) != len(set(bindings)):
        raise AssertionError("operational MT2 fixture bindings must be unique and non-empty")
    return bindings


def build_mt2_route(
    *,
    currency: str,
    bic: str,
    bank: dict[str, Any],
    index: int,
    debit_account_id: str,
) -> dict[str, Any]:
    ssi_code = f"SSI-MT2-UI-{currency}-{index:02d}"
    return {
        "ssiCode": ssi_code,
        "ssiName": f"{currency} MT2 interbank settlement via {bank['name']}",
        "applicabilityProfileId": f"APPL-MT2-{currency}-{bic}",
        "settlementRouteId": f"ROUTE-MT2-{currency}-{bic}",
        "counterpartyName": bank["name"],
        "counterpartyType": "BANK",
        "counterpartyBic": bic,
        "counterpartyCountry": bank["country"],
        "bankName": bank["name"],
        "bic": bic,
        "country": bank["country"],
        "currency": currency,
        "accountId": debit_account_id,
        "accountWithBic": bic,
        "actualReceiverBic": bic,
        "accountServicerCountry": bank["country"],
        "correspondentCountry": bank["country"],
        "beneficiaryBic": bic,
        "beneficiaryBankCountry": bank["country"],
        "intermediaryBic": "",
        "businessFunction": "INTERBANK_TRANSFER",
        "consumer": "CENTRAL_PAYMENT",
        "product": "CENTRAL_PAYMENT",
        "paymentLeg": "INTERBANK_SETTLEMENT",
        "routePurpose": "INTERBANK_TRANSFER",
        "messageTypes": "pacs.009.001.08",
        "businessService": "swift.cbprplus.04,swift.cbprplus.cov.04",
        "sourceMessageTypes": "MT202,MT202COV,MT205,MT205COV",
        "sampleSet": "MT2-UI-PARITY-SYNTHETIC",
        "settlementCountry": bank["country"],
        "settlementMarket": "CORRESPONDENT_BANKING",
        "clearingSystem": "CORRESPONDENT_CHAIN",
        "accountCurrency": currency,
        "direction": "OUTBOUND",
        "bookingEntity": "HK01",
        "messagingService": "FINPLUS",
        "instructionPurpose": "PAYMENT_SETTLEMENT",
        "routeType": "DIRECT",
        "routePreference": "PRIMARY" if index == 1 else "SECONDARY",
        "priority": str(index * 10),
        "resolutionReason": "Governed synthetic MT2 UI and QA route coverage",
        "validFrom": "2026-01-01",
        "validTo": "2027-12-31",
        "fixtureFamily": FIXTURE_FAMILY,
        "fixtureVariantVersion": "1.0",
    }


def insert_payload(
    connection: sqlite3.Connection, table: str, identifier: str, payload: dict[str, Any]
) -> None:
    connection.execute(
        f'INSERT OR REPLACE INTO "{table}"(id,payload,updated_at) VALUES(?,?,?)',
        (identifier, canonical_json(payload), TIMESTAMP),
    )


def audit(
    connection: sqlite3.Connection,
    table: str,
    identifier_column: str,
    identifier: str,
    action: str,
    payload: dict[str, Any],
) -> None:
    connection.execute(
        f'INSERT INTO "{table}"({identifier_column},action,actor,payload,occurred_at) '
        "VALUES(?,?,?,?,?)",
        (
            identifier,
            action,
            FIXTURE_MAKER,
            canonical_json(payload),
            TIMESTAMP,
        ),
    )


def main() -> None:
    rebuild = load_rebuild_module()
    OVERLAY.parent.mkdir(parents=True, exist_ok=True)
    rebuild.rebuild(SEED, OVERLAY)
    banks, required_bics = load_required_banks()
    operational_bindings = load_operational_fixture_bindings()

    connection = sqlite3.connect(OVERLAY)
    created = {"ssi": 0, "ssi_applicability": 0, "nostro_account": 0, "rma": 0}
    try:
        connection.execute("BEGIN IMMEDIATE")
        for table in ("ssi", "nostro_account", "rma_authorisation"):
            connection.execute(
                f'DELETE FROM "{table}" WHERE payload LIKE ?',
                (f'%"fixtureFamily":"{FIXTURE_FAMILY}"%',),
            )
        connection.execute(
            "DELETE FROM ssi_applicability WHERE payload LIKE ?",
            (f'%"fixtureFamily":"{FIXTURE_FAMILY}"%',),
        )

        for currency, receivers in CURRENCY_RECEIVERS.items():
            for index, bic in enumerate(receivers, start=1):
                bank = banks[bic]
                account_ids = []
                for side, offset in (("DEBIT", 0), ("CREDIT", 1)):
                    identifier = deterministic_uuid(f"nostro-{currency}-{bic}-{side}")
                    account_reference = f"MT2-{currency}-{bic}-{side}-V1"
                    nostro = {
                        "id": identifier,
                        "ownLegalEntityId": "HK01",
                        "allowedBookingEntities": ["HK01"],
                        "accountServicerBic": bic,
                        "currency": currency,
                        "maskedAccountRef": account_reference,
                        "accountReference": account_reference,
                        "purpose": "SETTLEMENT",
                        "priority": index * 10 + offset,
                        "validFrom": "2026-01-01",
                        "validTo": "2027-12-31",
                        "maker": FIXTURE_MAKER,
                        "checker": FIXTURE_CHECKER,
                        "source": "SYNTHETIC_DEMO",
                        "fixtureFamily": FIXTURE_FAMILY,
                        "fixtureBindingIds": operational_bindings,
                        "fixtureVariantVersion": "1.0",
                        "status": "ACTIVE",
                        "version": 1,
                        "createdAt": TIMESTAMP,
                        "updatedAt": TIMESTAMP,
                    }
                    insert_payload(connection, "nostro_account", identifier, nostro)
                    audit(
                        connection,
                        "nostro_audit_event",
                        "record_id",
                        identifier,
                        "MT2_UI_PARITY_NOSTRO_ACTIVATED",
                        nostro,
                    )
                    account_ids.append(account_reference)
                    created["nostro_account"] += 1

                ssi_id = deterministic_uuid(f"ssi-{currency}-{bic}")
                ssi_code = f"SSI-MT2-UI-{currency}-{index:02d}"
                route = build_mt2_route(
                    currency=currency,
                    bic=bic,
                    bank=bank,
                    index=index,
                    debit_account_id=account_ids[0],
                )
                ssi = {
                    "id": ssi_id,
                    "counterpartyId": f"CP-{bic}",
                    "scope": "STANDING",
                    "maker": FIXTURE_MAKER,
                    "checker": FIXTURE_CHECKER,
                    "ownershipType": "COUNTERPARTY",
                    "ownerParty": bic,
                    "publisherParty": bic,
                    "route": route,
                    "fixtureFamily": FIXTURE_FAMILY,
                    "fixtureBindingIds": operational_bindings,
                    "status": "ACTIVE",
                    "version": 1,
                    "createdAt": TIMESTAMP,
                    "updatedAt": TIMESTAMP,
                }
                applicability_id = f"{ssi_id}:APPL:1"
                applicability = {
                    "id": applicability_id,
                    "ssiId": ssi_id,
                    "consumer": "CENTRAL_PAYMENT",
                    "product": "CENTRAL_PAYMENT",
                    "businessFunction": "INTERBANK_TRANSFER",
                    "paymentLeg": "INTERBANK_SETTLEMENT",
                    "direction": "OUTBOUND",
                    "status": "ACTIVE",
                    "validFrom": "2026-01-01",
                    "validTo": "2027-12-31",
                    "fixtureFamily": FIXTURE_FAMILY,
                    "fixtureBindingIds": operational_bindings,
                    "version": 1,
                    "createdAt": TIMESTAMP,
                    "updatedAt": TIMESTAMP,
                }
                insert_payload(connection, "ssi", ssi_id, ssi)
                connection.execute(
                    "INSERT OR REPLACE INTO ssi_applicability(id,ssi_id,payload,updated_at) "
                    "VALUES(?,?,?,?)",
                    (applicability_id, ssi_id, canonical_json(applicability), TIMESTAMP),
                )
                audit(
                    connection,
                    "audit_event",
                    "ssi_id",
                    ssi_id,
                    "MT2_UI_PARITY_SSI_ACTIVATED",
                    ssi,
                )
                created["ssi"] += 1
                created["ssi_applicability"] += 1

                rma_id = deterministic_uuid(f"rma-finplus-{bic}")
                rma = {
                    "id": rma_id,
                    "ownBic": "DEMOHKHH",
                    "counterpartyBic": bic,
                    "service": "FINPLUS",
                    "direction": "OUTBOUND",
                    "messageTypes": ["pacs.009.001.08"],
                    "businessServices": [
                        "swift.cbprplus.04",
                        "swift.cbprplus.cov.04",
                    ],
                    "validFrom": "2026-01-01",
                    "validTo": "2027-12-31",
                    "maker": FIXTURE_MAKER,
                    "checker": FIXTURE_CHECKER,
                    "source": "SYNTHETIC_DEMO",
                    "fixtureFamily": FIXTURE_FAMILY,
                    "fixtureBindingIds": operational_bindings,
                    "fixtureVariantVersion": "1.0",
                    "status": "ACTIVE",
                    "version": 1,
                    "createdAt": TIMESTAMP,
                    "updatedAt": TIMESTAMP,
                }
                insert_payload(connection, "rma_authorisation", rma_id, rma)
        created["rma"] = len(required_bics)

        for bic in required_bics:
            rma_id = deterministic_uuid(f"rma-finplus-{bic}")
            rma_payload = json.loads(
                connection.execute(
                    "SELECT payload FROM rma_authorisation WHERE id=?", (rma_id,)
                ).fetchone()[0]
            )
            audit(
                connection,
                "rma_audit_event",
                "record_id",
                rma_id,
                "MT2_UI_PARITY_RMA_ACTIVATED",
                rma_payload,
            )
        connection.execute("COMMIT")
        connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise AssertionError(f"SQLite integrity check failed: {integrity}")
    except Exception:
        if connection.in_transaction:
            connection.execute("ROLLBACK")
        raise
    finally:
        connection.close()

    result = rebuild.export_seed(
        OVERLAY,
        SEED,
        fixture_id="SSI-DEMO-V15.3-MT2-UI-PARITY-V1",
    )
    print(json.dumps({"fixtureFamily": FIXTURE_FAMILY, "created": created, **result}, indent=2))


if __name__ == "__main__":
    main()
