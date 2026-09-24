"""Add governed MT347 executable counterparty alternatives to the canonical seed.

Lookup eligibility is deliberately independent from the scenario oracle: every
executable positive or negative scenario gets three governed counterparties for
each supported currency.  Negative fixture payloads retain their controlled SSI
defect, except upstream FIN-validator cases, which use a valid SSI profile and
leave the NVR outcome to the upstream owner.
"""
from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import uuid
from operator import itemgetter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / "qa/fixtures/rma/reload-test-data/ssi-demo.v15.8.pacs009-repaired-isolated.canonical.seed.json"
POSITIVE_SOURCE = ROOT / "qa/fixtures/mt347/mt347-positive.v1.json"
NEGATIVE_SOURCE = ROOT / "qa/fixtures/mt347/mt347-negative.v1.json"
SCENARIOS = ROOT / "parameters/resolution-page-scenarios.sr2026.json"
INPUTS = ROOT / "parameters/mt347-fixture-inputs.v1.json"
OUTPUT = ROOT / "qa/fixtures/mt347/mt347-executable-counterparties.v4.json"
MANIFEST = ROOT / "qa/fixtures/mt347/mt347-fixtures.v2.manifest.json"
FAMILY = "MT347-SR2026-SSI"
VARIANT_VERSION = "MT347-EXECUTABLE-MULTI-CURRENCY-COUNTERPARTY-OPTIONS-v4"
MANAGED_VARIANT_VERSIONS = {
    "MT347-COUNTERPARTY-OPTIONS-v2",
    "MT347-MULTI-CURRENCY-COUNTERPARTY-OPTIONS-v3",
    VARIANT_VERSION,
}
CURRENCIES = ("USD", "EUR", "GBP", "JPY", "HKD")
COUNTERPARTIES = {
    "DEUTDEFF": "BANK-SVC-DEUTDEFF",
    "CHASUS33": "BANK-SVC-CHASUS33",
    "BOFAUS3N": "BANK-SVC-BOFAUS3N",
}


def canonical(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def logical_identity(seed: dict) -> str:
    table_sql = {
        item["name"]: item["sql"]
        for item in seed["schema"]
        if item["type"] == "table"
    }
    tables = []
    for name in sorted(seed["tables"]):
        table = seed["tables"][name]
        columns = table["columns"]
        tables.append({
            "name": name,
            "sql": table_sql[name],
            "columns": columns,
            "rows": [dict(zip(columns, row, strict=True)) for row in table["rows"]],
        })
    body = {
        "method": "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1",
        "tables": tables,
    }
    return hashlib.sha256(canonical(body).encode("utf-8")).hexdigest().upper()


def identity(kind: str, binding: str, currency: str, bic: str) -> str:
    return str(uuid.uuid5(
        uuid.NAMESPACE_URL,
        f"{FAMILY}:{VARIANT_VERSION}:{kind}:{binding}:{currency}:{bic}",
    ))


def payloads(seed: dict, table_name: str) -> tuple[dict, int]:
    table = seed["tables"][table_name]
    return table, table["columns"].index("payload")


def row_for(payload: dict, table: dict) -> list:
    values = {"id": payload["id"], "payload": canonical(payload), "updated_at": payload["updatedAt"]}
    if "ssi_id" in table["columns"]:
        values["ssi_id"] = payload["ssiId"]
    return [values.get(column) for column in table["columns"]]


def load_sources() -> tuple[dict, dict, dict, dict, set[str], list[dict]]:
    seed = json.loads(SEED.read_text(encoding="utf-8"))
    positive = json.loads(POSITIVE_SOURCE.read_text(encoding="utf-8"))
    negative = json.loads(NEGATIVE_SOURCE.read_text(encoding="utf-8"))
    scenarios = json.loads(SCENARIOS.read_text(encoding="utf-8"))
    input_configuration = json.loads(INPUTS.read_text(encoding="utf-8"))
    upstream_ids = {
        rule["ruleId"].removeprefix("XTR-")
        for rule in scenarios["crossTagRules"]
        if rule.get("sourceOwnerInV6") == "UPSTREAM_FIN_VALIDATOR"
    }
    if len(upstream_ids) != 41:
        raise AssertionError(f"expected 41 upstream validator scenarios, got {len(upstream_ids)}")
    executable_ids = {
        scenario["scenarioId"]
        for scenario in scenarios["scenarios"]
        if not str(scenario.get("closureDisposition", "")).startswith("OUT_OF_SCOPE_CLOSED")
        and scenario["polarity"] != "BOUNDARY"
    }
    executable = [
        record
        for record in [*positive["records"], *negative["records"]]
        if record["testCaseId"] in executable_ids
    ]
    if len(executable) != 359:
        raise AssertionError(f"expected 359 executable records, got {len(executable)}")
    return seed, positive, negative, input_configuration, upstream_ids, executable


def load_fixture_builder():
    builder_path = ROOT / "scripts/mt347-final-qa/build-controlled-fixtures.py"
    spec = importlib.util.spec_from_file_location("mt347_fixture_builder", builder_path)
    if spec is None or spec.loader is None:
        raise AssertionError(f"cannot load fixture builder: {builder_path}")
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    return builder


def prepare_tables(seed: dict) -> tuple[dict, dict]:
    tables = {name: payloads(seed, name) for name in
              ("ssi", "ssi_applicability", "rma_authorisation", "nostro_account")}
    parsed = {}
    for name, (table, payload_index) in tables.items():
        parsed[name] = [json.loads(row[payload_index]) for row in table["rows"]]
        table["rows"] = [row for row in table["rows"]
                         if json.loads(row[payload_index]).get("fixtureVariantVersion")
                         not in MANAGED_VARIANT_VERSIONS]
    by_binding = {
        name: {item.get("fixtureBindingId"): item for item in rows
               if item.get("fixtureFamily") == FAMILY and item.get("fixtureBindingId")}
        for name, rows in parsed.items()
    }
    return tables, by_binding


def positive_templates(positive: dict) -> dict:
    templates = {}
    for record in positive["records"]:
        templates.setdefault(
            (record["messageType"], record["sequence"], record["settlementLeg"]),
            record,
        )
    return templates


def source_for(record: dict, upstream_ids: set[str], templates: dict) -> tuple[dict, str]:
    if record["testCaseId"] not in upstream_ids:
        return record, "SSI_FIELD_RESOLUTION_API"
    source = copy.deepcopy(
        templates[(record["messageType"], record["sequence"], record["settlementLeg"])]
    )
    source.update(
        testCaseId=record["testCaseId"],
        bindingId=record["bindingId"],
        identity=record["identity"],
        fixtureSet=record["fixtureSet"],
    )
    return source, "UPSTREAM_FIN_VALIDATOR"


def base_payloads(record: dict, source: dict, owner: str, by_binding: dict,
                  builder, input_configuration: dict, timestamp: str) -> tuple[dict, dict, dict, dict | None, bool]:
    binding = record["bindingId"]
    base_exists = binding in by_binding["ssi"] and owner == "SSI_FIELD_RESOLUTION_API"
    if base_exists:
        return (
            by_binding["ssi"][binding],
            by_binding["ssi_applicability"][binding],
            by_binding["rma_authorisation"][binding],
            by_binding["nostro_account"].get(binding),
            True,
        )
    return (*builder.build_positive_payloads(source, input_configuration, timestamp), False)


def prepare_base_payloads(payloads_to_prepare: tuple, base_exists: bool, owner: str) -> None:
    if base_exists:
        return
    for payload in payloads_to_prepare:
        if not payload:
            continue
        payload["fixtureVariantVersion"] = VARIANT_VERSION
        payload["validationOwner"] = owner
        payload["nvrOutcome"] = "NOT_EVALUATED" if owner == "UPSTREAM_FIN_VALIDATOR" else "N_A"


def append_base_payloads(tables: dict, payloads_to_append: dict, base_exists: bool) -> None:
    if base_exists:
        return
    for name, item in payloads_to_append.items():
        if item:
            table, _ = tables[name]
            table["rows"].append(row_for(item, table))


def replace_route_bic(route: dict, old_bic: str, bic: str, bank_service_id: str) -> None:
    for role, value in route.get("roleValues", {}).items():
        if value != old_bic:
            continue
        route["roleValues"][role] = bic
        if role in route.get("roleProvenance", {}):
            route["roleProvenance"][role]["sourceId"] = bank_service_id


def variant_payloads(binding: str, currency: str, bic: str, bank_service_id: str,
                     owner: str, base_ssi: dict, base_app: dict, base_rma: dict,
                     base_nostro: dict | None, timestamp: str) -> tuple[dict, dict, dict, dict]:
    variant_binding = f"{binding}::{currency}::{bic}"
    nvr_outcome = "NOT_EVALUATED" if owner == "UPSTREAM_FIN_VALIDATOR" else "N_A"
    ssi = copy.deepcopy(base_ssi)
    ssi.update(id=identity("SSI", binding, currency, bic), fixtureBindingId=variant_binding,
               counterpartyId=f"MT347-{bic}", version=1, updatedAt=timestamp,
               createdAt=timestamp, fixtureVariantVersion=VARIANT_VERSION,
               validationOwner=owner, nvrOutcome=nvr_outcome)
    route = ssi["route"]
    old_bic = base_ssi["route"]["counterpartyBic"]
    route.update(fixtureGroupId=binding, counterpartyBic=bic, currency=currency,
                 ssiCode=f"{route['ssiCode']}-{currency}-{bic}")
    replace_route_bic(route, old_bic, bic, bank_service_id)
    app = copy.deepcopy(base_app)
    app.update(id=identity("APPLICABILITY", binding, currency, bic), ssiId=ssi["id"],
               fixtureBindingId=variant_binding, version=1, updatedAt=timestamp,
               createdAt=timestamp, fixtureVariantVersion=VARIANT_VERSION,
               currency=currency, validationOwner=owner, nvrOutcome=nvr_outcome)
    rma = copy.deepcopy(base_rma)
    rma.update(id=identity("RMA", binding, currency, bic), fixtureBindingId=variant_binding,
               counterpartyBic=bic, version=1, updatedAt=timestamp,
               createdAt=timestamp, fixtureVariantVersion=VARIANT_VERSION)
    objects = {"ssi": ssi, "ssi_applicability": app, "rma_authorisation": rma}
    if base_nostro:
        nostro = copy.deepcopy(base_nostro)
        nostro.update(id=identity("NOSTRO", binding, currency, bic), fixtureBindingId=variant_binding,
                      version=1, updatedAt=timestamp, createdAt=timestamp,
                      fixtureVariantVersion=VARIANT_VERSION, currency=currency)
        for key in ("accountReference", "maskedAccountRef"):
            if nostro.get(key):
                value = nostro[key].replace("-USD-", f"-{currency}-")
                nostro[key] = f"{value}-{bic}"
        objects["nostro_account"] = nostro
    return objects, ssi, app, route


def append_payload_objects(tables: dict, objects: dict) -> None:
    for name, item in objects.items():
        table, _ = tables[name]
        table["rows"].append(row_for(item, table))


def variant_manifest_record(record: dict, binding: str, currency: str, bic: str,
                            bank_service_id: str, owner: str, ssi: dict,
                            app: dict, route: dict) -> dict:
    return {
        "fixtureGroupId": binding,
        "bindingId": f"{binding}::{currency}::{bic}",
        "testCaseId": record["testCaseId"],
        "messageType": record["messageType"],
        "businessFunction": record["businessFunction"],
        "sequence": record["sequence"],
        "settlementLeg": record["settlementLeg"],
        "currency": currency,
        "bookingEntity": "HK01",
        "counterpartyBankServiceId": bank_service_id,
        "counterpartyBic": bic,
        "polarity": record["polarity"],
        "validationOwner": owner,
        "nvrOutcome": "NOT_EVALUATED" if owner == "UPSTREAM_FIN_VALIDATOR" else "N_A",
        "identity": {
            "ssi": {"id": ssi["id"], "version": 1},
            "applicability": {"id": app["id"], "version": 1},
        },
        "roleValues": route.get("roleValues", {}),
    }


def expand_record_variants(record: dict, owner: str, tables: dict, base_ssi: dict,
                           base_app: dict, base_rma: dict, base_nostro: dict | None,
                           timestamp: str) -> list[dict]:
    binding = record["bindingId"]
    old_bic = base_ssi["route"]["counterpartyBic"]
    variants = []
    for currency in CURRENCIES:
        for bic, bank_service_id in COUNTERPARTIES.items():
            if currency == "USD" and bic == old_bic:
                continue
            objects, ssi, app, route = variant_payloads(
                binding, currency, bic, bank_service_id, owner, base_ssi,
                base_app, base_rma, base_nostro, timestamp,
            )
            append_payload_objects(tables, objects)
            variants.append(variant_manifest_record(
                record, binding, currency, bic, bank_service_id, owner, ssi, app, route,
            ))
    return variants


def main() -> None:
    seed, positive, negative, input_configuration, upstream_ids, executable = load_sources()
    builder = load_fixture_builder()
    tables, by_binding = prepare_tables(seed)
    templates = positive_templates(positive)
    variants = []
    timestamp = "2026-09-13T00:00:00.000Z"
    for record in executable:
        source_record, validation_owner = source_for(record, upstream_ids, templates)
        base_ssi, base_app, base_rma, base_nostro, base_exists = base_payloads(
            record, source_record, validation_owner, by_binding, builder,
            input_configuration, timestamp,
        )
        prepare_base_payloads(
            (base_ssi, base_app, base_rma, base_nostro),
            base_exists,
            validation_owner,
        )
        append_base_payloads(tables, {
            "ssi": base_ssi,
            "ssi_applicability": base_app,
            "rma_authorisation": base_rma,
            "nostro_account": base_nostro,
        }, base_exists)
        variants.extend(expand_record_variants(
            record, validation_owner, tables, base_ssi, base_app, base_rma,
            base_nostro, timestamp,
        ))
    for name, (table, _) in tables.items():
        id_index = table["columns"].index("id")
        table["rows"].sort(key=itemgetter(id_index))
    seed["source"]["logicalSha256"] = logical_identity(seed)
    SEED.write_text(json.dumps(seed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    artifact = {
        "schemaVersion": "3.0",
        "fixtureFamily": FAMILY,
        "classification": "SYNTHETIC_DEMO_QA_UAT",
        "loadPolicy": "CANONICAL_RELOAD",
        "sourceArtifacts": [
            {"path": POSITIVE_SOURCE.relative_to(ROOT).as_posix(), "sha256": digest(POSITIVE_SOURCE)},
            {"path": NEGATIVE_SOURCE.relative_to(ROOT).as_posix(), "sha256": digest(NEGATIVE_SOURCE)},
        ],
        "supportedCurrencies": list(CURRENCIES),
        "supportedBookingEntities": ["HK01"],
        "counterpartiesPerCurrency": len(COUNTERPARTIES),
        "currenciesPerFixtureGroup": len(CURRENCIES),
        "candidatesPerFixtureGroup": len(CURRENCIES) * len(COUNTERPARTIES),
        "records": variants,
    }
    OUTPUT.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest = {
        "schemaVersion": "3.0",
        "fixtureFamily": FAMILY,
        "canonicalExecutable": {
            "positiveBase": {"path": POSITIVE_SOURCE.relative_to(ROOT).as_posix(), "count": len(positive["records"]),
                     "sha256": digest(POSITIVE_SOURCE)},
            "negativeBase": {"path": NEGATIVE_SOURCE.relative_to(ROOT).as_posix(), "count": len(negative["records"]),
                     "sha256": digest(NEGATIVE_SOURCE)},
            "counterpartyVariants": {"path": OUTPUT.relative_to(ROOT).as_posix(), "count": len(variants),
                                     "sha256": digest(OUTPUT)},
            "expectedFixtureGroups": len(executable),
            "supportedCurrencies": list(CURRENCIES),
            "expectedCounterpartiesPerCurrency": len(COUNTERPARTIES),
            "expectedCurrenciesPerGroup": len(CURRENCIES),
            "expectedCandidatesPerGroup": len(CURRENCIES) * len(COUNTERPARTIES),
        },
        "negativeOraclePolicy": "Negative conditions remain isolated by fixture binding; lookup eligibility is canonical and does not constitute a PASS oracle.",
        "canonicalSeed": {"path": SEED.relative_to(ROOT).as_posix(), "sha256": digest(SEED)},
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"groups": len(executable), "variants": len(variants),
                      "upstreamValidatorScenarios": len(upstream_ids),
                      "seedSha256": digest(SEED), "artifactSha256": digest(OUTPUT),
                      "manifestSha256": digest(MANIFEST)}, indent=2))


if __name__ == "__main__":
    main()
