"""Fork the rejected v15.2 R8 workbook into a review-safe R9 candidate."""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "qa/mt2/uat/MT2xx_SSI_Resolution_UAT執行清單_v15.2_DRAFT_R8.xlsx"
OUTPUT = ROOT / "qa/mt2/uat/MT2xx_SSI_Resolution_UAT執行清單_v15.2_DRAFT_R9.xlsx"
REGISTRY = ROOT / "qa/mt2/reports/evidence/v15.2/assertion-registry.json"
OVERLAY_MANIFEST = ROOT / "qa/mt2/mt2-final/fixtures/overlays/ssi-demo.v15.2-own-account-uat.manifest.json"
OVERLAY_REGRESSION = ROOT / "qa/mt2/reports/MT2XX_v15.2_overlay_regression_20260911.json"
BASE_SHA = "52A58C19901F1FBD6A3EE964968A14164EDA89DF22B284282C88D05C3D5CEEF6"
OVERLAY_SHA = "C7C07A2DD74DD223CE8D0354DCA85B78816793B4C65D7163D5CDD1EC3B8C7F21"
LIVE_MAIN_SHA = "5B512253C4EE1B5A1E7B4B910C36563F4032BBB28F5A806ED90AFE6F425153E4"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def copy_row_style(sheet, source_row: int, target_row: int) -> None:
    for column in range(1, sheet.max_column + 1):
        source = sheet.cell(source_row, column)
        target = sheet.cell(target_row, column)
        if source.has_style:
            target._style = copy.copy(source._style)
        target.number_format = source.number_format
        target.protection = copy.copy(source.protection)
    sheet.row_dimensions[target_row].height = sheet.row_dimensions[source_row].height


def set_tnr11(workbook) -> None:
    for sheet in workbook.worksheets:
        for row in sheet.iter_rows():
            for cell in row:
                if cell.value is None:
                    continue
                font = copy.copy(cell.font)
                font.name = "Times New Roman"
                font.sz = 11
                cell.font = font


def append_evidence(sheet, rows: list[tuple[str, str, str, str, str]]) -> None:
    style_row = max(5, sheet.max_row)
    for values in rows:
        row = sheet.max_row + 1
        copy_row_style(sheet, style_row, row)
        for column, value in enumerate(values, 1):
            sheet.cell(row, column).value = value


def main() -> None:
    assert SOURCE.exists()
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    registry_by_case = {item["caseId"]: item for item in registry["cases"]}
    assert len(registry_by_case) == 20
    manifest = json.loads(OVERLAY_MANIFEST.read_text(encoding="utf-8"))
    manifest_text = json.dumps(manifest, sort_keys=True).upper()
    assert BASE_SHA in manifest_text
    assert OVERLAY_REGRESSION.exists()

    workbook = load_workbook(SOURCE)
    main_sheet = workbook["UAT 執行清單"]
    main_sheet["A1"] = "MT2xx SSI Resolution — UAT 執行清單 v15.2_DRAFT_R9（候選版 · NOT APPROVED）"
    main_sheet["A2"] = (
        f"基底：被退回但保留備查之 R8（SHA-256 {sha256(SOURCE)}）。R9 修正 MT202 BOOK_TRANSFER 53B／58A 契約與治理矛盾；"
        "20 個新增案例均退回 BLOCKED／PLANNED，待 OPEN-009／OPEN-010 關閉後重新執行。原 v15.1 之 48 案矩陣 A5:AD52 未改。"
    )

    cases = workbook["v15.2 新增案例"]
    cases["A1"] = "v15.2_DRAFT_R9 新增案例 — 20 案（候選版 · NOT APPROVED）"
    cases["A2"] = (
        "20 案均為 BLOCKED — IMPLEMENTATION／Evidence=PLANNED。BOOK-01～05 待 OPEN-009／OPEN-010；"
        "其餘 15 案待 OPEN-010。OPEN-007／OPEN-008 已關閉，但其舊 R8 evidence 已隔離，不得沿用。"
    )
    headers = {cell.value: cell.column for cell in cases[4]}
    for row in range(5, 25):
        case_id = str(cases.cell(row, headers["案例編號"]).value)
        registry_item = registry_by_case[case_id]
        cases.cell(row, headers["狀態"]).value = "BLOCKED — IMPLEMENTATION"
        cases.cell(row, headers["未決項"]).value = (
            "OPEN-009／OPEN-010" if case_id.startswith("BOOK-") else "OPEN-010"
        )
        cases.cell(row, headers["Evidence 狀態"]).value = "PLANNED"
        cases.cell(row, headers["Evidence JSON Path"]).value = registry_item["evidencePath"]
        cases.cell(row, headers["Machine Assertion ID"]).value = registry_item["assertionSetId"]
        for column in range(headers["Actual HTTP"], headers["PASS / FAIL"] + 1):
            cases.cell(row, column).value = None
        cases.cell(row, headers["Screenshot / Defect ID"]).value = None
        cases.cell(row, headers["Evidence SHA-256"]).value = None

    book_01 = cases.cell(5, headers["斷言內容"])
    book_01.value = (
        "七項集中驗證：(1) resolutionDomain=OWN_SSI_NOSTRO；(2) Counterparty SSI=SKIPPED；"
        "(3) MT 53B 必須存在且為 option B，Party Identifier=/<借記 accountReference>；"
        "(4) 57A 省略並標 OMITTED_BY_RULE；(5) 58A option A 第一行=/<貸記 accountReference>、第二行=DEMOHKHH；"
        "(6) debitReference 與 creditReference 渲染字串必須不同；即使 nostroId 不同，只要帳號字串相同即 422 OWN_ACCOUNT_DEBIT_CREDIT_COLLISION；"
        "(7) MX DbtrAcct/SttlmAcct 與 MT 53B/58A 帳號逐字一致，provenance 只得為 OWN_ENTITY／OWN_SSI_NOSTRO／RECEIVER_BANK_SERVICE。"
    )
    cases.cell(5, headers["MRG 錨點"]).value = (
        "SR2026 Cat2 MT202 p.40（53B debit／58A credit+Sender）；p.45（53a option B must）；"
        "p.52（57a omitted means Receiver=Awi）；p.54（58a option A）"
    )
    cases.cell(8, headers["斷言內容"]).value = (
        str(cases.cell(8, headers["斷言內容"]).value)
        + " 同時必須驗 MT 53B 與 58A 帳號格式及 MT/MX 帳號一致性；未驗者不得判 PASS。"
    )
    cases["B30"] = "連結 OPEN-009 之案數"
    cases["B30"] = '=COUNTIF($D$5:$D24,"*OPEN-009*")'
    cases["A30"] = "連結 OPEN-009 之案數"
    cases["A38"] = "納入 v15.2 新增案執行分母"
    cases["B38"] = '=COUNTIF($C$5:$C24,"APPROVED*")+COUNTIF($C$5:$C24,"CLOSED")'

    open_sheet = workbook["未決項清單"]
    open_sheet["A1"] = "未決項清單 — v15.2_DRAFT_R9 單一事實來源"
    open_sheet["A2"] = "R9 新增 OPEN-009／OPEN-010；兩者未關閉前不得引用 R8 的 PASS／DELIVERED 作為 release evidence。"
    open_headers = {cell.value: cell.column for cell in open_sheet[4]}
    rows = [
        (
            "OPEN-009",
            "MT202 BOOK_TRANSFER 報文契約",
            "OPEN",
            "產品／報文阻擋",
            "工程／QA",
            "須完成並重測：53B option B 必填且以 / 開頭；58A 帳號以 / 開頭；以實際渲染 debitReference != creditReference 防撞（不得只比 nostroId/version）；MT 53B/58A 與 MX 帳號映射一致。CdtrAcct 或 SttlmAcct 承載貸方帳號仍待 BA 明確裁示，裁示前不得關閉。",
            "BOOK-01～05；ASSERT-MT202-53B-PRESENT；ASSERT-MT202-58A-PARTYID-FORMAT",
        ),
        (
            "OPEN-010",
            "Evidence trust boundary",
            "OPEN",
            "證據阻擋",
            "QA／工程",
            "須由獨立 verifier 完成：snapshot identity 不得由環境變數覆寫；WAL-aware snapshot／原子證據集；schema v1.0；assertion ID 唯一、已登錄且由獨立程式評估；raw-byte SHA 實算。API 欄位須改為可直接 JSON Path 定址的 canonicalRoles（不得使用含斜線/空白的 key），且 beneficiary 必須有 OWN_ENTITY provenance。舊 R8 evidence 一律隔離，不得沿用 PASS。",
            "全部 20 案；snapshotHash；assertion registry；evidence JSON",
        ),
    ]
    for values in rows:
        row = open_sheet.max_row + 1
        copy_row_style(open_sheet, 12, row)
        for header, value in zip(
            ["未決項", "標題", "狀態", "類型", "裁決者", "內容／證據", "受影響列"],
            values,
        ):
            open_sheet.cell(row, open_headers[header]).value = value

    evidence = workbook["證據與範圍"]
    for row in range(40, 55):
        title = str(evidence.cell(row, 1).value or "")
        if title in {"v15.2_DRAFT_R7 狀態", "R7 變更範圍", "R7 不代表之事"}:
            evidence.cell(row, 1).value = title.replace("R7", "R9")
    evidence["B40"] = "DRAFT — NOT APPROVED / NOT EXECUTABLE。R9 為修正候選；R8 保留作 REJECTED 稽核軌跡。"
    evidence["B42"] = "修正版本標識與互斥敘述；新增 OPEN-009／010；20 案清除舊 actual/PASS/evidence；53B／58A／同帳戶／MT-MX 一致性納入斷言。原 48 案 A5:AD52 未動。"
    evidence["B50"] = "R9 不宣告新增 20 案已執行或通過：狀態為 BLOCKED — IMPLEMENTATION、Evidence=PLANNED、PASS/FAIL 空白。R8 的 20/20 僅保留為 REJECTED 歷史，不得作 release evidence。"
    evidence["C51"] = "REJECTED／QUARANTINED：缺 53B 與獨立 evidence trust boundary；不得引用 20/20 PASS。"
    evidence["C52"] = "REJECTED／QUARANTINED：需在 OPEN-009／010 關閉後重新執行。"
    append_evidence(
        evidence,
        [
            (
                "R9-SNAPSHOT-IDENTITY",
                "三種 snapshot 身分分離",
                f"controlled baseline={BASE_SHA}; QA-only overlay={OVERLAY_SHA}; live main-file hash={LIVE_MAIN_SHA}（非 WAL-aware evidence，不可互換）",
                OVERLAY_MANIFEST.relative_to(ROOT).as_posix(),
                sha256(OVERLAY_MANIFEST),
            ),
            (
                "R9-48-CASE-DIFF",
                "48 案逐案不漂移證據",
                "逐案比對 decision、chosen SSI code/version、candidates；彙總 44+4 僅作交叉檢查。",
                OVERLAY_REGRESSION.relative_to(ROOT).as_posix(),
                sha256(OVERLAY_REGRESSION),
            ),
            (
                "OPEN-009",
                "BOOK_TRANSFER 報文層",
                "OPEN：53B／58A 格式、帳戶撞號與 MT/MX 一致性修正後須重跑 BOOK-01～05。",
                "apps/ssi-service/src/app/message-domain-resolution.service.ts",
                "PENDING-REVIEW-NO-EVIDENCE-HASH",
            ),
            (
                "OPEN-010",
                "Evidence trust boundary",
                "OPEN：不得使用環境變數或 main-file-only hash；assertion 必須由獨立 verifier 評估。",
                "qa/mt2/reports/evidence/v15.2/assertion-registry.json",
                sha256(REGISTRY),
            ),
            (
                "BA-MX-CREDIT-ACCOUNT-MAPPING",
                "BOOK_TRANSFER 貸方 MX 映射待裁示",
                "OPEN：請 BA 裁示 58A Party Identifier 對應 CdtrAcct 或 SttlmAcct；R9 暫不更動既有 SttlmAcct 映射。",
                "v15.2 新增案例/BOOK-01",
                "NOT-APPLICABLE-PENDING-BA-DECISION",
            ),
        ],
    )

    change = workbook.copy_worksheet(workbook["變更說明 R8"])
    change.title = "變更說明 R9"
    for row in change.iter_rows():
        for cell in row:
            cell.value = None
    change["A1"] = "v15.2_DRAFT_R8（REJECTED）→ R9 修正候選"
    change["A2"] = "R8 保留不覆寫；R9 寫好後暫停，未執行瀏覽器 UAT，未關閉 OPEN-009／OPEN-010。"
    for column, value in enumerate(["#", "項目", "R8 問題", "R9 處理", "驗收閘門"], 1):
        change.cell(4, column).value = value
    changes = [
        (1, "版本與狀態", "檔名 R8、內容仍自稱 R7", "全表改為 R9 DRAFT；R8 明列 REJECTED", "不得出現 R7 現行敘述"),
        (2, "20 案 evidence", "PASS／DELIVERED 與未執行敘述互斥", "全退回 BLOCKED／PLANNED，actual 與 PASS 清空", "重跑前不得判 PASS"),
        (3, "MT202 53B／58A", "BOOK 路徑漏 53B；58A 帳號缺 /", "新增 53B option B 與 58A Party Identifier 格式", "OPEN-009"),
        (4, "帳戶與 MT/MX", "未擋相同渲染帳號；無跨格式一致性斷言", "debitReference=creditReference 即 422；貸方 MX 欄位待 BA 裁示", "OPEN-009"),
        (5, "Evidence 信任", "snapshot 可覆寫／未含 WAL；系統自證；JSON key/provenance 不完整", "隔離舊 evidence，新增獨立 verifier、canonicalRoles 與 beneficiary provenance 關閉條件", "OPEN-010"),
        (6, "Assertion ID", "省略號／全形斜線，不可註冊", "改用明確唯一 assertionSetId／assertionIds", "registry 查重"),
        (7, "Snapshot 與 drift", "三種 hash 未說明；只列 44+4", "登錄 baseline／overlay／live；逐案 diff 路徑與 SHA", "逐案差異須為 0"),
        (8, "格式", "Calibri、失效標籤、硬編分母", "Times New Roman 11；標籤改 OPEN-009；分母改公式", "字型與公式掃描"),
    ]
    for row, values in enumerate(changes, 5):
        if row > change.max_row:
            copy_row_style(change, 5, row)
        for column, value in enumerate(values, 1):
            change.cell(row, column).value = value
    change.freeze_panes = "A5"
    change.auto_filter.ref = f"A4:E{4 + len(changes)}"

    set_tnr11(workbook)
    workbook.calculation.fullCalcOnLoad = True
    workbook.calculation.forceFullCalc = True
    workbook.calculation.calcMode = "auto"
    workbook.save(OUTPUT)
    digest = sha256(OUTPUT)
    (OUTPUT.with_suffix(OUTPUT.suffix + ".sha256.txt")).write_text(
        f"{digest}  {OUTPUT.name}\n", encoding="utf-8"
    )
    print(json.dumps({"path": str(OUTPUT), "sha256": digest, "bytes": OUTPUT.stat().st_size}, ensure_ascii=False))


if __name__ == "__main__":
    main()
