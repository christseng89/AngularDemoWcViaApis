# MT3xx / MT4xx / MT7xx SSI Resolution QA v4

Gate: **CONDITIONAL PASS**.

- Supported scope remains exactly 25 message types, 53 message/sequence scenarios and 358 cases. MT742, MT754 and MT756 each retain 12 cases.
- All 164 Role Profile rows retain exactly one sequence-qualified `Field No. + detail page` anchor, mechanically rebuilt from the four Category 3/4/7 MRGs.
- `us2m_20260717.pdf` is now a primary controlled source: 211 pages, SHA-256 `64483D7F7C094DB28E03791AB6BBC7A0522DAEC90487A7DD834228E848FA8323`.
- The five Category 2 C81 rows cite the official primary pages: MT202 p.40, MT202 COV p.61, MT203 p.95, MT205 p.135 and MT205 COV p.155.
- The two cover-message C68 rows are explicit: MT202 COV C2 p.61 and MT205 COV C2 p.155; both are Sequence B `56a=>57a` rules.
- The verifier normalizes PDF page text with `re.sub(r'\s+', ' ', page_text)` before matching NVR wording. It requires exactly seven Cat2 rows and verifies the full-MRG token counts `C81=5` and `C68=2`.
- Rules remain keyed by `(messageType, ruleNumber)`, never error code alone. MT785 C1/C81 remains `57a=>56a`; Category 2 C81 remains `56a=>57a`.
- MX remains uniformly `{status: OUT_OF_SCOPE, reason: NO_CONTROLLED_ISO_ARTIFACT}`.

Release blockers remain unchanged: controlled Category 3/4/7 ISO mapping artifacts, executable isolated SSI/Nostro fixtures, governed option-specific data, clearing-code fidelity data, beneficiary/upstream provenance and full FIN validation outside the SSI resolver.
