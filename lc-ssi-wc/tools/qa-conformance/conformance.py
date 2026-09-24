# -*- coding: utf-8 -*-
"""
MT2XX QA 證據一致性測試套件 (TDD)
用途：把歷次 BA 覆核所確立的事實變成可執行斷言，讓每一版自己驗自己。
執行：python3 tools/qa-conformance/conformance.py
相依：openpyxl、受控 pdftotext binary（無 pytest 需求）
"""
import os, sys, json, hashlib, sqlite3, shutil, tempfile, re, collections, traceback, subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
def P(*a): return os.path.join(ROOT, *a)

# ---- 受控來源登錄（Source Register 的可執行版本） ----
REG = {
    "mrg":      (P("SWIFT", "us2m_20260717.pdf"),
                 "64483D7F7C094DB28E03791AB6BBC7A0522DAEC90487A7DD834228E848FA8323"),
    "db_main":  (P("data", "ssi-demo.sqlite"),
                 "5B512253C4EE1B5A1E7B4B910C36563F4032BBB28F5A806ED90AFE6F425153E4"),
    "db_wal":   (P("data", "ssi-demo.sqlite-wal"),
                 "83E705D27DAF4D4A6496B6D9853F704BA1032E4A3495F717276D2D42DBB98076"),
    "controlled_workbook":
                (P("qa", "mt2", "tdd", "MT2XX_支援標準SSI_SR2026_MRG與ISO20022對應覆核版_v15.1.xlsx"),
                 "0493C1D44D55A48B369AF6C6198BEE6943C1E17FC3A76AC93DE22C1D2A69A3D5"),
    "consistent_snapshot":
                (P("qa", "mt2", "mt2-final", "fixtures", "baselines", "ssi-demo.v15.1-post-migration.sqlite"),
                 "52A58C19901F1FBD6A3EE964968A14164EDA89DF22B284282C88D05C3D5CEEF6"),
    "post_migration_report":
                (P("qa", "mt2", "reports", "MT2XX_v15.1_post_migration_tie_scan_20260911.json"),
                 "CBA6D5D0704CC37788251D8DDCA0D987C6F8404AD19B32FC7C51BDAA67AAB2CB"),
}
WORKBOOK_V15 = REG["controlled_workbook"][0]
WORKBOOK_QA  = P("qa/fixtures/mt2/MT2XX_測試案例_SSI與NOSTRO_v6.2_FINAL.xlsx")
MAPPINGS     = P("parameters", "ssi-mappings.sr2026.json")
MT202_57A_FIXTURE = P("qa", "mt2", "mt2-final", "fixtures", "mt202-57a-option-selection.v15.1.json")
PARETO_CONTRACT = P("qa", "mt2", "test_cases", "mt2-pareto-selection.json")
UAT_V152 = P("qa", "mt2", "uat", "MT2xx_SSI_Resolution_UAT執行清單_v15.2_DRAFT_R10.xlsx")
EVIDENCE_SCHEMA = P("qa", "mt2", "reports", "evidence", "v15.2", "evidence.schema.json")
ASSERTION_REGISTRY = P("qa", "mt2", "reports", "evidence", "v15.2", "assertion-registry.json")
INDEPENDENT_EVIDENCE_VERIFIER = P("scripts", "mt2-v152-evidence-verifier.mjs")
OWN_ACCOUNT_OVERLAY_MANIFEST = P("qa", "mt2", "mt2-final", "fixtures", "overlays", "ssi-demo.v15.2-own-account-uat.manifest.json")

EXPECTED_COUNTS = {"ssi_total": 254, "ssi_active": 42, "nostro_active": 159, "rma_active_outbound": 42}
EXPECTED_AUDIT  = {"lack_08": 16, "lack_ownershiptype": 11, "accountid_orphan": 0, "nostro_no_account_reference": 69, "nostro_no_abe": 68}

# ---- 迷你測試框架 ----
TESTS, RESULTS = [], []
class SkipTest(Exception):
    pass

def test(group, name):
    def deco(fn):
        TESTS.append((group, name, fn)); return fn
    return deco
def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""): h.update(b)
    return h.hexdigest().upper()

# ---- 共用夾具 ----
_cache = {}
def db():
    """EC-SQLITE-01/03：以 main + -wal + -shm 原子證據集開啟，取得 query-visible state。"""
    if "db" in _cache: return _cache["db"]
    tmp = tempfile.mkdtemp(prefix="qaconf-")
    for suf in ("", "-wal", "-shm"):
        src = REG["db_main"][0] + suf
        if os.path.exists(src): shutil.copy2(src, os.path.join(tmp, "s.sqlite" + suf))
    c = sqlite3.connect(os.path.join(tmp, "s.sqlite"))
    _cache["db"] = c
    return c
def rows(table):
    return [json.loads(r[0]) for r in db().execute(f"select payload from {table}")]
def g(r, k):
    v = r.get(k)
    return v if v is not None else (r.get("route") or {}).get(k)
def active_ssi():
    return [r for r in rows("ssi") if r.get("status") == "ACTIVE"]
def snapshot_rows(table):
    if "snapshot_db" not in _cache:
        snapshot_uri = "file:" + REG["consistent_snapshot"][0].replace("\\", "/") + "?mode=ro&immutable=1"
        _cache["snapshot_db"] = sqlite3.connect(snapshot_uri, uri=True)
    return [json.loads(r[0]) for r in _cache["snapshot_db"].execute(f"select payload from {table}")]
def snapshot_active_ssi():
    return [r for r in snapshot_rows("ssi") if r.get("status") == "ACTIVE"]
def nested_items(value):
    if isinstance(value, dict):
        for key, child in value.items():
            yield key, child
            yield from nested_items(child)
    elif isinstance(value, list):
        for child in value:
            yield from nested_items(child)
def wb(path):
    import openpyxl
    if path not in _cache: _cache[path] = openpyxl.load_workbook(path, data_only=True)
    return _cache[path]
def sheet_rows(path, name):
    ws = wb(path)[name]; h = [c.value for c in ws[1]]
    return [dict(zip(h, [c.value for c in r])) for r in ws.iter_rows(min_row=2)]

HEX64 = re.compile(r"[0-9A-F]{64}")

def v152_case_rows():
    """Return the 20 v15.2 evidence rows, keyed by the workbook's visible headers."""
    ws = wb(UAT_V152)["v15.2 新增案例"]
    headers = [cell.value for cell in ws[4]]
    return [
        dict(zip(headers, row))
        for row in ws.iter_rows(min_row=5, max_row=24, values_only=True)
    ]

def evidence_registry():
    with open(ASSERTION_REGISTRY, encoding="utf-8") as source:
        payload = json.load(source)
    cases = payload["cases"]
    by_case = {item["caseId"]: item for item in cases}
    assert len(by_case) == len(cases), "duplicate case ID in assertion registry"
    assertion_ids = [assertion_id for item in cases for assertion_id in item["assertionIds"]]
    assert len(set(assertion_ids)) == len(assertion_ids), "assertion IDs must be globally unique"
    return by_case

def repo_path(reference):
    """Resolve a repository-relative evidence path without allowing path traversal."""
    assert isinstance(reference, str) and reference.strip(), "evidence path is required"
    candidate = os.path.abspath(P(*re.split(r"[/\\]", reference.strip())))
    assert os.path.commonpath((ROOT, candidate)) == ROOT, f"evidence path escapes repository: {reference}"
    return candidate

def validate_evidence_document(document, registry_entry):
    """Validate the executable subset of evidence.schema.json without a new dependency."""
    with open(EVIDENCE_SCHEMA, encoding="utf-8") as source:
        schema = json.load(source)
    required = set(schema["required"])
    assert required <= document.keys(), f"missing evidence fields: {sorted(required - document.keys())}"
    assert document["schemaVersion"] == schema["properties"]["schemaVersion"]["const"]
    assert document["caseId"] == registry_entry["caseId"]
    assert document["status"] in schema["properties"]["status"]["enum"]
    execution = document["execution"]
    for field in schema["properties"]["execution"]["required"]:
        assert isinstance(execution.get(field), str) and execution[field].strip(), f"execution.{field} is required"
    source_document = document["source"]
    for field in schema["properties"]["source"]["required"]:
        assert field in source_document, f"source.{field} is required"
    assert isinstance(source_document["snapshotSha256"], str), "source.snapshotSha256 must be a string"
    snapshot_hash = source_document["snapshotSha256"].upper()
    assert HEX64.fullmatch(snapshot_hash), "source.snapshotSha256 must be 64 hexadecimal characters"
    assert source_document["snapshotIdentityMethod"] == "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1"
    assertions = document["assertions"]
    assert isinstance(assertions, list) and assertions, "assertions must be a non-empty array"
    by_id = {item.get("id"): item for item in assertions}
    assert len(by_id) == len(assertions), "duplicate assertion ID"
    expected_ids = set(registry_entry["assertionIds"])
    assert set(by_id) == expected_ids, (
        f"assertion IDs differ: expected={sorted(expected_ids)} actual={sorted(by_id)}")
    for assertion_id, result in by_id.items():
        assert isinstance(result.get("passed"), bool), f"{assertion_id}.passed must be boolean"
    expected_status = "PASS" if all(item["passed"] for item in assertions) else "FAIL"
    assert document["status"] == expected_status, (
        f"status={document['status']} but assertion result requires {expected_status}")

def verify_evidence_path(case_id, path, expected_sha256, evidence_reference=None, independent=False):
    """Core ASSERT-EVIDENCE-HASH implementation for an already resolved file path."""
    registry = evidence_registry()
    assert case_id in registry, f"unregistered case: {case_id}"
    expected = str(expected_sha256 or "").upper()
    assert HEX64.fullmatch(expected), "expected evidence SHA-256 must be 64 hexadecimal characters"
    display_path = evidence_reference or path
    assert os.path.isfile(path), f"evidence JSON not found: {display_path}"
    actual = sha256(path)
    assert actual == expected, f"ASSERT-EVIDENCE-HASH failed: expected={expected} actual={actual}"
    with open(path, encoding="utf-8") as source:
        document = json.load(source)
    validate_evidence_document(document, registry[case_id])
    if independent:
        completed = subprocess.run(
            ["node", INDEPENDENT_EVIDENCE_VERIFIER, case_id, path, expected],
            cwd=ROOT, text=True, capture_output=True)
        assert completed.returncode == 0, (
            f"independent evidence verification failed: {completed.stderr or completed.stdout}")
    return {"caseId": case_id, "path": display_path, "sha256": actual, "status": document["status"]}

def verify_evidence(case_id, evidence_reference, expected_sha256):
    """Resolve a repository evidence path, then validate its hash, schema and registry entry."""
    return verify_evidence_path(
        case_id, repo_path(evidence_reference), expected_sha256, evidence_reference, independent=True)

def verify_delivered_uat_evidence():
    """Verify every workbook row marked DELIVERED; PLANNED/IN_PROGRESS are not evidence."""
    results = []
    for row in v152_case_rows():
        if row["Evidence 狀態"] != "DELIVERED":
            continue
        results.append(verify_evidence(
            row["案例編號"], row["Evidence JSON Path"], row["Evidence SHA-256"]))
    return results

def record_evidence(case_id, source_path):
    """Validate and atomically store the exact source bytes at the registered evidence path."""
    registry = evidence_registry()
    assert case_id in registry, f"unregistered case: {case_id}"
    assert os.path.isfile(source_path), f"evidence JSON not found: {source_path}"
    raw = open(source_path, "rb").read()
    document = json.loads(raw.decode("utf-8"))
    validate_evidence_document(document, registry[case_id])
    destination = repo_path(registry[case_id]["evidencePath"])
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=f".{case_id}-", suffix=".tmp", dir=os.path.dirname(destination))
    try:
        with os.fdopen(handle, "wb") as target:
            target.write(raw)
            target.flush()
            os.fsync(target.fileno())
        os.replace(temporary, destination)
    finally:
        if os.path.exists(temporary): os.remove(temporary)
    digest = sha256(destination)
    return {
        "caseId": case_id,
        "path": registry[case_id]["evidencePath"],
        "sha256": digest,
        "status": document["status"],
        "note": "SHA-256 covers exact raw bytes; any reserialization or line-ending change invalidates it",
    }

# =========================== A. 證據控制 ===========================
@test("A 證據控制", "EC-SQLITE-02 主檔為 WAL 模式時須證明與原子證據集等價，否則不得採信")
def a1():
    tmp = tempfile.mkdtemp(prefix="qaconf-main-")
    shutil.copy2(REG["db_main"][0], os.path.join(tmp, "m.sqlite"))   # 故意只複製主檔
    c = sqlite3.connect(os.path.join(tmp, "m.sqlite"))
    mode = c.execute("pragma journal_mode").fetchone()[0]
    n = c.execute("select count(*) from ssi").fetchone()[0]
    assert mode == "wal", f"journal_mode={mode}"
    if n == EXPECTED_COUNTS["ssi_total"]:
        atomic = db()
        for table in ("ssi", "nostro_account", "rma_authorisation"):
            main_payloads = sorted(row[0] for row in c.execute(f"select payload from {table}"))
            atomic_payloads = sorted(row[0] for row in atomic.execute(f"select payload from {table}"))
            assert main_payloads == atomic_payloads, (
                f"{table}: main-only count appears complete but payload differs from WAL-aware evidence")
    else:
        assert n != len(rows("ssi")), "main-only divergence was not detected"
@test("A 證據控制", "登錄的 live main SHA-256 與實檔一致")
def a2(): assert sha256(REG["db_main"][0]) == REG["db_main"][1]
@test("A 證據控制", "登錄的 WAL sidecar SHA-256 與實檔一致")
def a3(): assert sha256(REG["db_wal"][0]) == REG["db_wal"][1]
@test("A 證據控制", "登錄的 MRG SHA-256 與實檔一致")
def a4(): assert sha256(REG["mrg"][0]) == REG["mrg"][1]
@test("A 證據控制", "受控 v15.1 workbook SHA-256 與 manifest 一致")
def a4a(): assert sha256(REG["controlled_workbook"][0]) == REG["controlled_workbook"][1]
@test("A 證據控制", "受控 consistent snapshot SHA-256 與登錄值一致")
def a4b(): assert sha256(REG["consistent_snapshot"][0]) == REG["consistent_snapshot"][1]
@test("A 證據控制", "WAL-aware 讀取得到登錄的四個母體數")
def a5():
    got = {
        "ssi_total": len(rows("ssi")),
        "ssi_active": len(active_ssi()),
        "nostro_active": len([n for n in rows("nostro_account") if n.get("status") == "ACTIVE"]),
        "rma_active_outbound": len([r for r in rows("rma_authorisation")
                                    if r.get("status") == "ACTIVE" and r.get("direction") == "OUTBOUND"]),
    }
    assert got == EXPECTED_COUNTS, got

# =========================== B. 資料事實 ===========================
def _mts(r):
    m = g(r, "messageTypes")
    return [x.strip() for x in (m if isinstance(m, list) else str(m or "").split(","))if x.strip()]
@test("B 資料事實", f"{EXPECTED_AUDIT['lack_08']} 筆 ACTIVE SSI 未宣告 pacs.009.001.08")
def b1():
    n = sum(1 for r in active_ssi() if "pacs.009.001.08" not in _mts(r))
    assert n == EXPECTED_AUDIT["lack_08"], n
@test("B 資料事實", f"{EXPECTED_AUDIT['lack_ownershiptype']} 筆 ACTIVE SSI 缺 ownershipType key")
def b2():
    n = sum(1 for r in active_ssi() if "ownershipType" not in json.dumps(r))
    assert n == EXPECTED_AUDIT["lack_ownershiptype"], n

@test("B 資料事實", "CONF-COV-05a：遷移後 26 筆 ACTIVE SSI 有 businessService，24 筆明列 COV")
def b2a():
    active = snapshot_active_ssi()
    with_service = [item for item in active if g(item, "businessService")]
    cov = [item for item in with_service if "swift.cbprplus.cov.04" in str(g(item, "businessService")).split(",")]
    assert (len(active), len(with_service), len(cov)) == (42, 26, 24), (
        len(active), len(with_service), len(cov))

@test("B 資料事實", "CONF-COV-05b：24 筆 explicit COV allow-list；messageTypes 無 synthetic .COV")
def b2b():
    active = snapshot_active_ssi()
    explicitly_allowed = [
        g(item, "ssiCode") for item in active
        if {"MT202COV", "MT205COV"}.issubset(
            set(str(g(item, "sourceMessageTypes") or "").split(",")))
    ]
    message_type_cov = [
        (g(item, "ssiCode"), token)
        for item in active
        for token in _mts(item)
        if token.upper().endswith(".COV")
    ]
    assert len(explicitly_allowed) == 24, explicitly_allowed
    assert message_type_cov == [], message_type_cov

@test("B 資料事實", "CONF-COV-05c：catalogue 具備 Core/COV pacs.009.001.08 canonical tuples")
def b2c():
    mappings = json.load(open(MAPPINGS, encoding="utf-8"))["mappings"]
    tuples = {
        (item.get("messageType"), item.get("businessService")) for item in mappings
        if item.get("messageType") == "pacs.009.001.08"
        and item.get("businessService")
    }
    assert tuples == {
        ("pacs.009.001.08", "swift.cbprplus.04"),
        ("pacs.009.001.08", "swift.cbprplus.cov.04"),
    }, tuples

@test("B 資料事實", "CONF-COV-04：目前 UAT planning inventory 與可執行分母分離")
def b2d():
    planned, core, gate_anchors, not_executable = 48, 24, 2, 22
    assert core + gate_anchors == 26
    assert core + gate_anchors + not_executable == planned
    for n in range(13):
        for b in (0, 1):
            if b > n:
                continue
            denominator = 24 + 2 * n
            resolved = 22 + 2 * (n - b)
            ambiguous = 2 + 2 * b
            not_executable = 24 - 2 * n
            assert resolved + ambiguous == denominator, (n, b)
            assert resolved + ambiguous + not_executable == planned, (n, b)

@test("B 資料事實", "CONF-COV-01：canonical COV profile tuple 與 12-pair allow-list")
def b2e():
    profile = json.load(open(P("parameters", "cov-profile-allow-list.v15.1.json"), encoding="utf-8"))
    assert (profile["messageDefinitionId"], profile["businessService"]) == (
        "pacs.009.001.08", "swift.cbprplus.cov.04")
    codes = {code for pair in profile["pairs"] for code in pair["ssiCodes"]}
    assert len(profile["pairs"]) == 12 and len(codes) == 24, (len(profile["pairs"]), len(codes))
    migrated = {g(item, "ssiCode"): item for item in snapshot_active_ssi()}
    assert codes <= migrated.keys(), sorted(codes - migrated.keys())
    for code in codes:
        assert "swift.cbprplus.cov.04" in str(g(migrated[code], "businessService")).split(","), code
        sources = set(str(g(migrated[code], "sourceMessageTypes")).split(","))
        assert {"MT202COV", "MT205COV"} <= sources, code

@test("B 資料事實", "CONF-COV-02：缺 profile 時 pre-rank 503/no Core fallback")
def b2f():
    report = json.load(open(REG["post_migration_report"][0], encoding="utf-8"))
    control = next(x for x in report["negativeControls"] if x["control"] == "CONF-COV-02-NO-CORE-FALLBACK")
    assert control["passed"] is True, control
    assert (control["actualStatus"], control["actualCode"], control["payloadGenerated"]) == (
        503, "PROFILE_INCOMPLETE", False), control

@test("B 資料事實", "CONF-COV-03：pair2 post-DG COV 轉 422 ambiguity")
def b2g():
    report = json.load(open(REG["post_migration_report"][0], encoding="utf-8"))
    pair2_cov = [x for x in report["results"] if x["pair"] == 2 and x["sourceMessageType"].endswith("COV")]
    assert len(pair2_cov) == 2, pair2_cov
    for result in pair2_cov:
        assert result["passed"] is True and result["actualStatus"] == 422, result
        assert result["actualCode"] == "SSI_AMBIGUOUS", result
        assert set(result["candidateSsiCodes"]) == {"SSI-DEMO-003", "SSI-DEMO-022", "SSI-DEMO-004"}, result
@test("B 資料事實", f"{EXPECTED_AUDIT['accountid_orphan']} 筆 ACTIVE SSI 的 accountId 無 ACTIVE Nostro join")
def b3():
    references = {
        n_.get("accountReference")
        for n_ in rows("nostro_account")
        if n_.get("status") == "ACTIVE" and n_.get("accountReference")
    }
    orphans = [
        (g(r, "ssiCode"), g(r, "accountId"))
        for r in active_ssi()
        if g(r, "accountId") and g(r, "accountId") not in references
    ]
    assert len(orphans) == EXPECTED_AUDIT["accountid_orphan"], orphans

@test("B 資料事實", f"{EXPECTED_AUDIT['nostro_no_account_reference']} 筆 ACTIVE Nostro 缺 accountReference")
def b3a():
    missing = [
        n_.get("id")
        for n_ in rows("nostro_account")
        if n_.get("status") == "ACTIVE" and not n_.get("accountReference")
    ]
    assert len(missing) == EXPECTED_AUDIT["nostro_no_account_reference"], missing
@test("B 資料事實", f"{EXPECTED_AUDIT['nostro_no_abe']} 筆 ACTIVE Nostro 缺 allowedBookingEntities key（缺鍵＝UNKNOWN 非 ANY）")
def b4():
    na = [x for x in rows("nostro_account") if x.get("status") == "ACTIVE"]
    n = sum(1 for x in na if "allowedBookingEntities" not in x)
    assert n == EXPECTED_AUDIT["nostro_no_abe"], n

@test("B 資料事實", "68 筆 ACTIVE Nostro 同時缺 accountReference 與 allowedBookingEntities")
def b4a():
    active = [x for x in rows("nostro_account") if x.get("status") == "ACTIVE"]
    both = [
        x.get("id")
        for x in active
        if not x.get("accountReference") and "allowedBookingEntities" not in x
    ]
    assert len(both) == 68, both

# =========================== C. 匯出保真 ===========================
@test("C 匯出保真", "Excel 匯出的每筆 SSI 與 DB payload 逐欄一致（無新增、無竄改）")
def c1():
    exp = {}
    for s in ("Bank Counterparty SSI", "Customer SSI Negative"):
        for d in sheet_rows(WORKBOOK_QA, s): exp[d["ssiCode"]] = d
    src = {g(r, "ssiCode"): r for r in active_ssi()}
    assert set(exp) == set(src), f"多出:{sorted(set(exp)-set(src))} 缺少:{sorted(set(src)-set(exp))}"
    bad = []
    for code, d in exp.items():
        r = src[code]
        if str(d.get("version")) != str(r.get("version")): bad.append((code, "version"))
        if str(d.get("messageTypes raw") or "") != str(g(r, "messageTypes") or ""): bad.append((code, "messageTypes"))
        present = "ownershipType" in json.dumps(r)
        if (str(d.get("ownershipType key present")).upper() == "YES") != present: bad.append((code, "ownershipType key"))
    assert not bad, bad[:8]
@test("C 匯出保真", "Source Fidelity Audit 的數字等於重新計算值")
def c2():
    got = {}
    for d in sheet_rows(WORKBOOK_QA, "Source Fidelity Audit"):
        got[str(d["Check"])] = d["Affected"]
    m = {"ACTIVE SSI missing pacs.009.001.08": EXPECTED_AUDIT["lack_08"],
         "ACTIVE SSI missing ownershipType key": EXPECTED_AUDIT["lack_ownershiptype"],
         "ACTIVE SSI accountId without ACTIVE Nostro join": EXPECTED_AUDIT["accountid_orphan"],
         "ACTIVE Nostro missing allowedBookingEntities key": EXPECTED_AUDIT["nostro_no_abe"]}
    bad = {k: (got.get(k), v) for k, v in m.items() if got.get(k) != v}
    assert not bad, bad

# =========================== D. MRG 頁碼錨點 ===========================
def mrg_sections():
    if "mrg_sec" in _cache: return _cache["mrg_sec"]
    binary = shutil.which("pdftotext")
    if not binary:
        raise SkipTest("pdftotext is not installed; PDF anchor checks require the controlled extraction engine")
    output = tempfile.NamedTemporaryFile(suffix=".txt", delete=False)
    output.close()
    completed = subprocess.run(
        [binary, "-layout", "-enc", "UTF-8", REG["mrg"][0], output.name],
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode:
        raise AssertionError(f"pdftotext failed: {completed.stderr.strip()}")
    with open(output.name, encoding="utf-8", errors="replace") as extracted:
        pages = extracted.read().split("\f")
    if pages and not pages[-1].strip():
        pages.pop()
    cur, start, out = None, None, {}
    for i, t in enumerate(pages):
        m = re.search(r"For Standards MT November 2026\s+(MT \d+(?: COV)?)\b", t)
        nm = m.group(1) if m else None
        if nm != cur:
            if cur: out[cur] = (start, i)
            cur, start = nm, i + 1
    if cur: out[cur] = (start, len(pages))
    _cache["mrg_sec"] = (out, pages)
    return _cache["mrg_sec"]
@test("D MRG 錨點", "Payment Message Index 的九個頁段等於實際章節範圍")
def d1():
    sec, _ = mrg_sections()
    want = {"MT200": "MT 200", "MT201": "MT 201", "MT202": "MT 202", "MT202 COV": "MT 202 COV",
            "MT203": "MT 203", "MT204": "MT 204", "MT205": "MT 205", "MT205 COV": "MT 205 COV",
            "MT210": "MT 210"}
    bad = []
    for d in sheet_rows(WORKBOOK_V15, "Payment Message Index"):
        mt = str(d.get("MT Message") or "").strip()
        cite = str(d.get("依據") or "")
        m = re.search(r"MRG pp\.(\d+)[–-](\d+)", cite)
        if mt in want and m:
            exp = sec[want[mt]]
            if (int(m.group(1)), int(m.group(2))) != exp: bad.append((mt, m.group(0), exp))
    assert not bad, bad
@test("D MRG 錨點", "MT202 53a=p.45 / 54a=p.46；MT202 COV 53a=p.66 / 54a=p.67")
def d2():
    _, pages = mrg_sections()
    def page_of(pat):
        for i, t in enumerate(pages, 1):
            if re.search(pat, t): return i
        return None
    assert page_of(r"MT 202 - \d+\. Field 53a") == 45
    assert page_of(r"MT 202 - \d+\. Field 54a") == 46
    assert page_of(r"MT 202 COV- \d+\. Field 53a") == 66
    assert page_of(r"MT 202 COV- \d+\. Field 54a") == 67
@test("D MRG 錨點", "C08 商品幣別禁令存在於 Cat 2 各付款電文（非僅 CBPR+ 規則）")
def d3():
    _, pages = mrg_sections()
    hit = [i for i, t in enumerate(pages, 1) if "Error code(s): C08" in t]
    assert len(hit) >= 8, hit
@test("D MRG 錨點", "MT200/201/210 於 MRG 無 58a 欄位")
def d4():
    sec, pages = mrg_sections()
    for mt in ("MT 200", "MT 201", "MT 210"):
        a, b = sec[mt]
        body = "\n".join(pages[a - 1:b])
        assert not re.search(r"Field 58[aA]:", body), mt

# =========================== E. v15 契約 ===========================
@test("E v15 契約", "v15 全檔使用的結果碼/狀態皆已登錄於「解析結果代碼」")
def e1():
    W = wb(WORKBOOK_V15); reg = set()
    for r in W["解析結果代碼"].iter_rows(min_row=2, values_only=True):
        if r[0]:
            for p in re.split(r"[／/ ]", str(r[0])):
                p = p.strip().rstrip("*")
                if re.fullmatch(r"[A-Za-z][A-Za-z_]{3,}", p): reg.add(p)
    types = set()
    for r in W["解析結果代碼"].iter_rows(min_row=2, values_only=True):
        if r[4]: types.add(str(r[4]).split("·")[0].strip())
    metadata_tokens = {
        "A1_RESOLVED", "A2_TIE", "A3_AMBIGUOUS_SHAPE", "A4_NOSTRO_JOIN",
        "CENTRAL_PAYMENT", "COVERAGE_GAP", "INTERBANK_TRANSFER", "NAMED_EXACT_APPL",
        "NOT_EXECUTABLE",
        "NOT_EXECUTABLE_DATA_PRECONDITION", "NOT_MATERIALIZED_NO_HASH",
        "OMIT_57A", "OWN_ENTITY", "PROPOSED_QA_ONLY", "REQUEST_PASS_THROUGH",
        "SETTLEMENT_POLICY", "SR2026_MT_PAYMENTS", "TIED_ON_CONTROLLED_RANK_KEYS",
        "UPSTREAM_CONTEXT",
    }
    unknown = collections.defaultdict(set)
    for s in W.worksheets:
        for row in s.iter_rows():
            for c in row:
                if isinstance(c.value, str):
                    for m in re.findall(r"\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){1,7}\b", c.value):
                        if m not in reg and m not in types and m not in metadata_tokens and m != "SHA_256": unknown[m].add(s.title)
    assert not unknown, {k: sorted(v) for k, v in unknown.items()}
@test("E v15 契約", "redirectDomain 逐電文值與 Index UI-API 規則 8 的枚舉一致")
def e2():
    ALLOWED = {"OWN_SSI_NOSTRO", "FI_DIRECT_DEBIT", "NOTIFICATION", "null"}
    EXPECT = {"MT200": "OWN_SSI_NOSTRO", "MT201": "null", "MT202": "null", "MT202 COV": "null",
              "MT203": "null", "MT204": "FI_DIRECT_DEBIT", "MT205": "null", "MT205 COV": "null",
              "MT210": "NOTIFICATION"}
    bad = []
    for d in sheet_rows(WORKBOOK_V15, "Payment Message Index"):
        mt = str(d.get("MT Message") or "").strip()
        dec = str(d.get("BA / Implementation decision") or "")
        m = re.search(r"redirectDomain=([A-Za-z_]+)", dec)
        if mt in EXPECT:
            v = m.group(1) if m else None
            if v not in ALLOWED or v != EXPECT[mt]: bad.append((mt, v, EXPECT[mt]))
    assert not bad, bad

# =========================== F. Pareto A1-A4 契約 ===========================
def pareto_contract():
    with open(PARETO_CONTRACT, encoding="utf-8") as source:
        return json.load(source)["responseContracts"]

@test("F Pareto A1-A4", "A1 RESOLVED：唯一 chosen、完整 provenance、空 alternatives、hash+token")
def f1_contract():
    actual = pareto_contract()["A1_RESOLVED"]
    assert actual["httpStatus"] == 200
    assert actual["decision"] == "RESOLVED"
    assert actual["code"] == "SSI_RESOLVED"
    assert actual["exactlyOneChosenRoute"] is True
    assert actual["completeRoleProvenance"] is True
    assert actual["alternatives"] == []
    assert set(actual["requiredSnapshotFields"]) == {"snapshotHash", "resolutionToken"}

@test("F Pareto A1-A4", "A2 top-rank tie：v15 確認 422 SSI_AMBIGUOUS")
def f2_contract():
    actual = pareto_contract()["A2_TIE"]
    assert actual == {
        "decision": "SSI_AMBIGUOUS",
        "code": "SSI_AMBIGUOUS",
        "httpStatus": 422,
        "httpStatusStatus": "APPROVED",
    }

@test("F Pareto A1-A4", "A3 AMBIGUOUS：無 chosen/canonical/provenance/context，只留 unordered candidates")
def f3_contract():
    actual = pareto_contract()["A3_AMBIGUOUS_SHAPE"]
    assert set(actual["nullFields"]) == {
        "chosenRoute", "canonicalRoles", "roleProvenance", "messageComposerContext"
    }
    assert actual["payloadGenerated"] is False
    assert actual["candidateCollection"] == "candidates"
    assert actual["candidateOrder"] == "UNORDERED"
    assert actual["ambiguityReason"] == "TIED_ON_CONTROLLED_RANK_KEYS"
    assert actual["tiedOn"] == ["priority", "routePreference", "specificity"]
    assert set(actual["forbiddenFields"]) == {"alternativeRoutes", "renderedPayload"}

@test("F Pareto A1-A4", "A4：42/42 exact ACTIVE Nostro.accountReference、orphan=0")
def f4_contract():
    actual = pareto_contract()["A4_NOSTRO_JOIN"]
    assert actual["joinRule"] == "SSI.route.accountId === ACTIVE Nostro.accountReference"
    assert (actual["activeSsi"], actual["exactMatches"], actual["orphans"]) == (42, 42, 0)

@test("F Pareto A1-A4", "Proposed QA Seed 是隔離且可執行的 QA-only orphan fixture")
def f5_contract():
    with open(PARETO_CONTRACT, encoding="utf-8") as source:
        manifest = json.load(source)
    seed = manifest["proposedQaSeed"]
    assert seed["ssiCode"] == "QA-SSI-ORPHAN-001"
    assert seed["status"] == "PROPOSED_QA_ONLY"
    assert seed["executableFixture"] is True
    assert seed["isolated"] is True
    assert seed["mustNotExistInBaseline"] is True
    assert all(g(r, "ssiCode") != seed["ssiCode"] for r in active_ssi())

@test("F Pareto A1-A4", "Impact scan 記錄日期、snapshot hash、grouping 與 hit count")
def f6_contract():
    with open(PARETO_CONTRACT, encoding="utf-8") as source:
        scan = json.load(source)["impactScan"]
    assert scan["recordedAt"] == "2026-09-11"
    snapshot = P("qa", "mt2", "mt2-final", "fixtures", "baselines", "ssi-demo.consistent-snapshot.sqlite")
    assert scan["snapshotSha256"] == sha256(snapshot)
    assert set(scan["grouping"]) == {
        "counterparty", "currency", "bookingEntity", "consumer", "product",
        "businessFunction", "paymentLeg", "direction", "messageType"
    }
    assert (scan["requestGroupCount"], scan["hitCount"], scan["candidateHitCount"]) == (46, 1, 3)
    assert (scan["topRankTieMemberCount"], scan["affectedSourceMessageJourneys"], scan["uniqueResolvedSourceMessageJourneys"]) == (2, 4, 44)
    assert set(scan["candidateSsiCodes"]) == {"SSI-DEMO-003", "SSI-DEMO-022", "SSI-DEMO-004"}
    applicability = [
        item for item in rows("ssi_applicability")
        if item.get("status") == "ACTIVE"
        and item.get("consumer") == "CENTRAL_PAYMENT"
        and item.get("product") == "CENTRAL_PAYMENT"
        and item.get("businessFunction") == "INTERBANK_TRANSFER"
        and item.get("paymentLeg") == "INTERBANK_SETTLEMENT"
        and item.get("direction") == "OUTBOUND"
    ]
    applicable_ids = {item["ssiId"] for item in applicability}
    eligible = [
        item for item in active_ssi()
        if item.get("id") in applicable_ids
        and g(item, "ownerParty") == "BARCGB22"
        and g(item, "currency") == "GBP"
        and g(item, "bookingEntity") == "HK01"
        and "pacs.009.001.08" in _mts(item)
    ]
    def rank(item):
        route_preference = str(g(item, "routePreference") or "").upper()
        route_preference_rank = {"PRIMARY": 0, "SECONDARY": 1}.get(route_preference, 2)
        return (int(g(item, "priority")), route_preference_rank, 0)
    top_rank = min(map(rank, eligible))
    tied = [item for item in eligible if rank(item) == top_rank]
    lower = [item for item in eligible if rank(item) > top_rank]
    assert top_rank == (10, 0, 0)
    assert {g(item, "ssiCode") for item in tied} == {"SSI-DEMO-003", "SSI-DEMO-022"}
    assert {g(item, "ssiCode") for item in lower} == {"SSI-DEMO-004"}

@test("F Pareto A1-A4", "v15 API_FIELD chosenRoute/candidates 與 A1-A4/EC-RANK-01 均為 CONFIRMED")
def f7_contract():
    contract_rows = {
        row["Control ID"]: row
        for row in sheet_rows(WORKBOOK_V15, "Resolver Contract v15")
    }
    for control_id in (
        "A1_RESOLVED", "A2_TIE", "A3_AMBIGUOUS_SHAPE", "A4_NOSTRO_JOIN",
        "EC-RANK-01", "API-chosenRoute", "API-candidates"
    ):
        assert contract_rows[control_id]["BA status"] == "CONFIRMED", control_id
    assert contract_rows["A2_TIE"]["HTTP / code"] == "422 / SSI_AMBIGUOUS"
    assert "priority → routePreference → specificity" in contract_rows["EC-RANK-01"]["Field / ordering semantics"]
    assert "alternativeRoutes" in contract_rows["API-candidates"]["Forbidden behavior"]
    code_rows = {
        row["代碼"]: row
        for row in sheet_rows(WORKBOOK_V15, "解析結果代碼")
    }
    for field in ("chosenRoute", "candidates", "roleProvenance", "payloadGenerated"):
        assert "API_FIELD" in code_rows[field]["類型／HTTP API 行為"], field

@test("F Pareto A1-A4", "v15 Source Register 與 Evidence & Impact 綁定同一 snapshot")
def f8_contract():
    source_rows = {
        row["Evidence ID"]: row
        for row in sheet_rows(WORKBOOK_V15, "Source Register")
    }
    snapshot_hash = "7492CC264BCDBC7EE43DC7028CDCDC12385898BFD4BDCCA02798D2B5A3AB4EF3"
    for source_id in (
        "SRC-SSI-SNAPSHOT-20260910", "SRC-SSI-TIE-SCAN-20260911",
        "SRC-SSI-RI-AUDIT-20260911"
    ):
        assert source_rows[source_id]["Integrity / snapshot"] == snapshot_hash, source_id
    impact_rows = {
        row["Evidence ID"]: row
        for row in sheet_rows(WORKBOOK_V15, "Evidence & Impact v15")
    }
    assert "46 actual .08 request groups" in impact_rows["TIE-SCAN-SUMMARY"]["Request / object"]
    assert "topRankTieGroups=1" in impact_rows["TIE-SCAN-SUMMARY"]["Observed values"]
    assert "42/42 exact" in impact_rows["RI-AUDIT-NEW"]["Controlled decision"]
    assert "69 missing accountReference" in impact_rows["DG-ACCOUNTREF"]["Observed values"]

@test("F Pareto A1-A4", "v15.1 CONF-COV-01..06 的執行時點與 gate 狀態一致")
def f9_contract():
    controls = {
        row["Control ID"]: row
        for row in sheet_rows(WORKBOOK_V15, "Resolver Contract v15")
    }
    for control_id in ("CONF-COV-01", "CONF-COV-02", "CONF-COV-03"):
        assert "NOT EXECUTABLE" in controls[control_id]["BA status"], control_id
    for control_id in ("CONF-COV-04", "CONF-COV-05"):
        assert controls[control_id]["BA status"] == "EXECUTABLE NOW — SOURCE FIDELITY", control_id
    assert controls["CONF-COV-06"]["BA status"] == "EXECUTABLE NOW / RED BY DESIGN"

@test("G 已知未修", "CONF-COV-06：post-migration tie-scan 證據完整才可關閉 DG")
def g0_conf_cov_06():
    evidence_path = P("qa", "mt2", "reports", "MT2XX_v15.1_execution_evidence.json")
    with open(evidence_path, encoding="utf-8") as handle:
        evidence = json.load(handle)
    assert evidence["evidenceId"] == "SRC-POST-MIGRATION-TIE-SCAN"
    assert evidence["status"] == "AVAILABLE"
    report_hash = str(evidence["reportSha256"] or "").upper()
    assert re.fullmatch(r"[0-9A-F]{64}", report_hash), report_hash
    report_reference = str(evidence["reportPath"] or "")
    report_path = P(*re.split(r"[/\\]", report_reference))
    assert os.path.isfile(report_path), report_path
    assert sha256(report_path) == report_hash, "tie-scan report SHA-256 mismatch"
    with open(report_path, encoding="utf-8") as report:
        payload = report.read()
    path_match = re.search(r'"snapshotPath"\s*:\s*"([^"]+)"', payload)
    hash_match = re.search(r'"snapshotSha256"\s*:\s*"([0-9A-Fa-f]{64})"', payload)
    assert path_match and hash_match, "report must register snapshotPath and snapshotSha256"
    snapshot_reference = path_match.group(1)
    snapshot_path = snapshot_reference if os.path.isabs(snapshot_reference) else P(*re.split(r"[/\\]", snapshot_reference))
    assert os.path.isfile(snapshot_path), snapshot_path
    assert sha256(snapshot_path) == hash_match.group(1).upper(), "post-migration snapshot SHA-256 mismatch"
    assert evidence["snapshotPath"] == snapshot_reference
    assert evidence["snapshotSha256"] == hash_match.group(1).upper()
    assert evidence["uat"] == {
        "planned": 48, "passed": 48, "resolved": 44,
        "ambiguous": 4, "profileIncomplete": 0,
    }

# =========================== G. 已知未修（預期 RED） ===========================
@test("G 已知未修", "v15 對 ssi-mappings.sr2026.json 的敘述與實檔一致")
def g1():
    m = json.load(open(MAPPINGS, encoding="utf-8"))["mappings"]
    opts = collections.Counter(x.get("option") for x in m)
    claim = None
    for r in wb(WORKBOOK_V15)["跨欄位規則與清算碼"].iter_rows(values_only=True):
        blob = " ".join(str(x) for x in r if x)
        if "ssi-mappings.sr2026.json" in blob: claim = blob
    assert claim, "v15 未提及此檔"
    mt202 = [x for x in m if x.get("messageType") == "MT202"]
    assert len(m) == 481, len(m)
    assert opts == collections.Counter({"A": 181, "J": 144, "D": 137, "B": 16, None: 3}), dict(opts)
    assert {(x.get("tag"), x.get("option")) for x in mt202} == {("57", "A"), ("57", "D")}
    assert "0 筆" in claim and "COVERAGE_GAP" in claim, claim
    for token in ("A180", "J144", "D136", "B16", "null 3"):
        assert token in claim, token
@test("G 已知未修", "ssi-mappings 已涵蓋 MT2xx（MT compatibility renderer 需要）")
def f2():
    m = json.load(open(MAPPINGS, encoding="utf-8"))["mappings"]
    mt2 = sorted({x["messageType"] for x in m if str(x["messageType"]).startswith("MT2")})
    assert mt2 == ["MT202"], mt2
    rows57 = [x for x in m if x["messageType"] == "MT202" and x.get("tag") == "57"]
    assert {x.get("option") for x in rows57} == {"A", "D"}
    fixture = json.load(open(MT202_57A_FIXTURE, encoding="utf-8"))
    assert fixture["evidence"]["sha256"] == REG["mrg"][1]
    assert fixture["evidence"]["pages"] == [50, 51, 52]
    cases = {x["id"]: x for x in fixture["cases"]}
    assert cases["MT202-57A-BIC"]["expectedOption"] == "A"
    d_cases = [x for x in fixture["cases"] if x["expectedOption"] == "D"]
    assert d_cases and all(x["reasonRequired"] and x.get("reason") for x in d_cases)
@test("G 已知未修", "ssi-mappings 的 pacs.009 條目使用 v15.1 canonical tuple")
def f3():
    m = json.load(open(MAPPINGS, encoding="utf-8"))["mappings"]
    p009 = [x for x in m if str(x["messageType"]).startswith("pacs.009")]
    tuples = {(x["messageType"], x.get("businessService")) for x in p009}
    assert tuples == {
        ("pacs.009.001.08", "swift.cbprplus.04"),
        ("pacs.009.001.08", "swift.cbprplus.cov.04"),
    }, tuples
@test("G 已知未修", "58a 不得為 SSI-derived role 的規則已限定為 Category 2")
def f4():
    m = json.load(open(MAPPINGS, encoding="utf-8"))["mappings"]
    s58 = [x for x in m if str(x.get("tag")) == "58" and x.get("scopeStatus") == "SSI_SUPPORTED"]
    mts = sorted({x["messageType"] for x in s58})
    assert all(x.startswith("MT3") for x in mts), f"58a 標 SSI_SUPPORTED 的非 MT3xx 電文：{[x for x in mts if not x.startswith('MT3')]}"
    assert mts, "無任何 58a SSI_SUPPORTED——若已改為全面排除，請同步更新本測試與 BA 決議"

# =========================== H. v15.2 Evidence gate ===========================
@test("H v15.2 Evidence", "OPEN-008：schema 與 20 組 assertion registry 已建立並與 UAT 清單對位")
def h1_evidence_contract():
    with open(EVIDENCE_SCHEMA, encoding="utf-8") as source:
        schema = json.load(source)
    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert schema["title"] == "MT2xx SSI Resolution UAT Evidence v15.2"
    registry = evidence_registry()
    rows = {row["案例編號"]: row for row in v152_case_rows()}
    assert len(rows) == len(registry) == 20
    assert set(rows) == set(registry)
    for case_id, entry in registry.items():
        row = rows[case_id]
        assert entry["evidencePath"] == row["Evidence JSON Path"], case_id
        assert entry["assertionSetId"] == row["Machine Assertion ID"], case_id
        assert entry["assertionIds"], case_id
        assert len(entry["assertionIds"]) == len(set(entry["assertionIds"])), case_id

@test("H v15.2 Evidence", "ASSERT-EVIDENCE-HASH：正確檔案通過，錯 hash 與竄改檔案均 fail-closed")
def h2_evidence_hash_gate():
    registry = evidence_registry()
    entry = registry["GEN-202-01"]
    folder = tempfile.mkdtemp(prefix="v152-evidence-")
    path = os.path.join(folder, "GEN-202-01.json")
    document = {
        "schemaVersion": "1.0",
        "caseId": "GEN-202-01",
        "status": "PASS",
        "generatedAt": "2026-09-11T12:00:00Z",
        "execution": {
            "correlationId": "CONF-HASH-001",
            "tester": "qa-conformance",
            "executionDate": "2026-09-11",
        },
        "source": {
            "snapshotSha256": REG["consistent_snapshot"][1],
            "snapshotIdentityMethod": "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1",
            "resolutionToken": "controlled-test-token",
        },
        "request": {},
        "response": {},
        "assertions": [
            {"id": assertion_id, "passed": True, "expected": {}, "actual": {}}
            for assertion_id in entry["assertionIds"]
        ],
    }
    with open(path, "w", encoding="utf-8", newline="\n") as target:
        json.dump(document, target, ensure_ascii=False, indent=2)
        target.write("\n")
    correct_hash = sha256(path)
    assert verify_evidence_path("GEN-202-01", path, correct_hash)["status"] == "PASS"
    try:
        verify_evidence_path("GEN-202-01", path, "0" * 64)
        raise AssertionError("wrong evidence hash was accepted")
    except AssertionError as exc:
        assert "ASSERT-EVIDENCE-HASH failed" in str(exc)
    with open(path, "a", encoding="utf-8") as target:
        target.write(" ")
    try:
        verify_evidence_path("GEN-202-01", path, correct_hash)
        raise AssertionError("tampered evidence was accepted")
    except AssertionError as exc:
        assert "ASSERT-EVIDENCE-HASH failed" in str(exc)
    os.remove(path)
    os.rmdir(folder)

@test("H v15.2 Evidence", "工作簿僅驗證 DELIVERED evidence；PLANNED/IN_PROGRESS 不得冒充交付證據")
def h3_workbook_evidence_gate():
    rows = v152_case_rows()
    assert all(row["Evidence 狀態"] in {"PLANNED", "IN_PROGRESS", "DELIVERED"} for row in rows)
    delivered = [row for row in rows if row["Evidence 狀態"] == "DELIVERED"]
    results = verify_delivered_uat_evidence()
    assert len(results) == len(delivered)
    assert {item["caseId"] for item in results} == {row["案例編號"] for row in delivered}

@test("H v15.2 Evidence", "Evidence 路徑必須留在 repository，禁止絕對路徑與 traversal")
def h4_evidence_path_gate():
    for unsafe in ("../outside.json", "qa/reports/latest/mt2/evidence/v15.2/../../../../../outside.json"):
        try:
            repo_path(unsafe)
            raise AssertionError(f"unsafe path was accepted: {unsafe}")
        except AssertionError as exc:
            assert "escapes repository" in str(exc)

@test("H v15.2 Evidence", "Evidence schema/registry 負向案例：missing、unknown、duplicate、schema mismatch 全部 fail-closed")
def h5_evidence_negative_contracts():
    entry = evidence_registry()["GEN-202-01"]
    base = {
        "schemaVersion": "1.0", "caseId": "GEN-202-01", "status": "PASS",
        "generatedAt": "2026-09-11T12:00:00Z",
        "execution": {"correlationId": "C", "tester": "T", "executionDate": "2026-09-11"},
        "source": {"snapshotSha256": REG["consistent_snapshot"][1], "snapshotIdentityMethod": "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1", "resolutionToken": "R"},
        "request": {}, "response": {},
        "assertions": [{"id": x, "passed": True, "expected": {}, "actual": {}}
                       for x in entry["assertionIds"]],
    }
    cases = []
    wrong_schema = dict(base); wrong_schema["schemaVersion"] = "9.9"; cases.append(wrong_schema)
    unknown = dict(base); unknown["assertions"] = [{"id": "ASSERT-UNKNOWN", "passed": True, "expected": {}, "actual": {}}]; cases.append(unknown)
    duplicate = dict(base); duplicate["assertions"] = [*base["assertions"], dict(base["assertions"][0])]; cases.append(duplicate)
    for document in cases:
        try:
            validate_evidence_document(document, entry)
            raise AssertionError("invalid evidence contract was accepted")
        except AssertionError:
            pass
    try:
        verify_evidence_path("GEN-202-01", os.path.join(tempfile.gettempdir(), "missing-evidence.json"), "0" * 64)
        raise AssertionError("missing evidence file was accepted")
    except AssertionError as exc:
        assert "not found" in str(exc)

@test("H v15.2 Evidence", "Atomic evidence writer 保留原始 bytes 並輸出可回填 workbook 的 SHA")
def h6_atomic_evidence_writer():
    entry = evidence_registry()["GEN-202-01"]
    folder = tempfile.mkdtemp(prefix="v152-record-")
    source_path = os.path.join(folder, "source.json")
    document = {
        "schemaVersion": "1.0", "caseId": "GEN-202-01", "status": "PASS",
        "generatedAt": "2026-09-11T12:00:00Z",
        "execution": {"correlationId": "C", "tester": "T", "executionDate": "2026-09-11"},
        "source": {"snapshotSha256": REG["consistent_snapshot"][1], "snapshotIdentityMethod": "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1", "resolutionToken": "R"},
        "request": {}, "response": {},
        "assertions": [{"id": x, "passed": True, "expected": {}, "actual": {}}
                       for x in entry["assertionIds"]],
    }
    raw = (json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    with open(source_path, "wb") as target: target.write(raw)
    result = record_evidence("GEN-202-01", source_path)
    destination = repo_path(entry["evidencePath"])
    assert open(destination, "rb").read() == raw
    assert result["sha256"] == hashlib.sha256(raw).hexdigest().upper()
    os.remove(destination); os.remove(source_path); os.rmdir(folder)

# =========================== I. v15.2 QA-only overlay ===========================
@test("I v15.2 Overlay", "OPEN-006：明示 57A fixture 隔離、綁 baseline hash 且不得存在 baseline")
def i1_explicit_57a_overlay():
    manifest = json.load(open(OWN_ACCOUNT_OVERLAY_MANIFEST, encoding="utf-8"))
    assert manifest["status"] == "PROPOSED_QA_ONLY"
    assert manifest["mustNotExistInBaseline"] is True
    assert manifest["baseSnapshot"]["sha256"] == REG["consistent_snapshot"][1]
    assert sha256(repo_path(manifest["baseSnapshot"]["path"])) == manifest["baseSnapshot"]["sha256"]
    assert sha256(repo_path(manifest["overlaySnapshot"]["path"])) == manifest["overlaySnapshot"]["sha256"]
    base_ids = {item["id"] for item in snapshot_rows("nostro_account")}
    assert all(item["nostroId"] not in base_ids for item in manifest["records"])
    assert len(manifest["records"]) == 2
    assert manifest["scenario"] == "CREDIT_ONE_OF_SEVERAL_AT_57A"

@test("I v15.2 Overlay", "原 48 案逐案 decision/chosen version/candidates 不漂移，44+4 僅交叉檢查")
def i2_overlay_case_by_case_regression():
    manifest = json.load(open(OWN_ACCOUNT_OVERLAY_MANIFEST, encoding="utf-8"))
    evidence = manifest["regressionEvidence"]
    path = repo_path(evidence["path"])
    assert sha256(path) == evidence["sha256"]
    report = json.load(open(path, encoding="utf-8"))
    assert report["baseSnapshotSha256"] == REG["consistent_snapshot"][1]
    assert report["overlaySnapshotSha256"] == manifest["overlaySnapshot"]["sha256"]
    assert len(report["cases"]) == report["planned"] == 48
    assert report["differences"] == evidence["differences"] == 0
    assert all(item["baseline"] == item["overlay"] and not item["differences"] for item in report["cases"])
    assert report["aggregateCrossCheck"] == {"resolved": 44, "ambiguous": 4}

# =========================== 執行 ===========================
def main():
    width = 76
    cur = None; passed = failed = skipped = 0
    for grp, name, fn in TESTS:
        if grp != cur:
            cur = grp; print("\n" + "=" * width); print(cur); print("=" * width)
        try:
            fn(); print(f"  PASS  {name}"); passed += 1
        except SkipTest as e:
            print(f"  SKIP  {name}\n          → {e}"); skipped += 1
        except AssertionError as e:
            print(f"  FAIL  {name}\n          → {str(e)[:400]}"); failed += 1
        except Exception:
            print(f"  ERROR {name}\n          → {traceback.format_exc().splitlines()[-1][:300]}"); failed += 1
    print("\n" + "=" * width)
    print(f"總計 {passed+failed+skipped}｜PASS {passed}｜SKIP {skipped}｜FAIL {failed}")
    print("=" * width)
    return 1 if failed else 0

def cli(argv):
    if not argv:
        return main()
    if argv[0] == "--verify-uat-evidence" and len(argv) == 1:
        results = verify_delivered_uat_evidence()
        print(json.dumps({"verifiedDelivered": len(results), "results": results}, ensure_ascii=False, indent=2))
        return 0
    if argv[0] == "--verify-evidence" and len(argv) == 4:
        try:
            result = verify_evidence(argv[1], argv[2], argv[3])
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 0
        except (AssertionError, KeyError, ValueError, json.JSONDecodeError) as exc:
            print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False, indent=2))
            return 1
    if argv[0] == "--record-evidence" and len(argv) == 3:
        try:
            print(json.dumps(record_evidence(argv[1], argv[2]), ensure_ascii=False, indent=2))
            return 0
        except (AssertionError, KeyError, ValueError, json.JSONDecodeError) as exc:
            print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False, indent=2))
            return 1
    print("Usage: conformance.py [--verify-uat-evidence | --verify-evidence CASE_ID PATH SHA256 | --record-evidence CASE_ID SOURCE_JSON]", file=sys.stderr)
    return 2

if __name__ == "__main__":
    sys.exit(cli(sys.argv[1:]))
