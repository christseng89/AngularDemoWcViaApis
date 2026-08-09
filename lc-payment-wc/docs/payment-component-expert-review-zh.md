# Payment Component —— 贸易金融与支付方案架构师评审

**评审视角：** 贸易金融/支付实务专家（CITF / CPCM / CDCS 层次）结合解决方案架构评审
**评审范围：** `microservices/payment-component/src/**`（真正的会计引擎），并参考 `CLAUDE.md`、`README.md` 及 Angular Simulator 的既有行为
**日期：** 2026-08-09

---

## 1. 总体评价

对于一个支付/会计引擎而言，这是一套相当自律、规范的代码库。贸易金融清算系统里最常出错的地方，这里都有意做对了：所有金额运算一律走 `decimal.js`（绝不用 IEEE-754 浮点），并且集中收口在唯一入口 `money.ts`，在单点强制 OAS 十进制字符串格式；Charge Component 与 Payment Component 通过 `Suspense - Credit` 清算科目干净地隔离，收费入账从不重复；FX 配对腿复用"已经落在报文上"的金额，而不是再用汇率乘一次（v1.7.x 的历史记录显示团队已经发现并消灭了经典的"先合并再换算"的舍入漂移 bug）。测试覆盖率和"对偏离设计逐条留痕"的纪律都很强。

因此，下面的意见大多**不是"这里坏了"，而是控制缺口与生产加固项**——是银行独立模型验证/审计部门在这套引擎真正向生产总账入账之前会提出的问题。按 严重 → 低 排序。

---

> **说明——原「C-1（分币种平衡从未校验）」已撤回。** 与团队核对后确认：分币种平衡**是硬控制**——
> 任何跨币种转换都必须经由 **FX Exchange（汇兑头寸）科目**、以成对且自平衡的分录落账，因此每个币别的
> Dr = Cr 由构造恒成立，任何真实差额仍会被聚合的 V8 检查抓到；Simulator 的 **CURRENCY VIEW** 会把逐币种
> 平衡显式呈现出来。这是标准、正确的多币种总账控制，**不是缺口**。详见 §6。

## 2. 严重（Critical）

### C-2. 幂等重放忽略请求**报文体**——修正后的重提会被静默吞掉
**文件：** `store/paymentInstructionStore.ts`、`domain/confirmPaymentInstruction.ts:73-78`

自然键是 `(originModule, mainRef, sequence)`。第二次用相同键 POST 时，服务直接返回**原始**指令（`created:false`，HTTP 200），完全不看新报文体。对于**真正的重放**这是对的，但也意味着：如果调用方用相同 sequence 重提、但**腿金额不同**（例如操作员纠正一个输错的金额，或两笔本就不同的交易撞到了同一个键），得到的是旧结果、且无任何报错——修正丢失，而调用方以为成功了。

**建议：** 命中自然键时，对规范化的请求报文做哈希/比对。报文相同 → 幂等重放（现有行为）；报文不同 → 以 `409 IDEMPOTENCY_KEY_CONFLICT` 拒绝。这是标准的幂等契约（参考 Stripe `Idempotency-Key` 语义），也与 FSD 自己的"唯一约束"注记一致。

---

## 3. 高（High）

### H-1. 先查后写的幂等不是原子操作（重复入账竞态）
**文件：** `store/paymentInstructionStore.ts:38-41`、`confirmPaymentInstruction.ts:73-78, 157`

`find()` 之后再 `save()` 是典型的 check-then-act。单线程 Node 在**单实例内**掩盖了它，但生产注记已经承认这里必须换成共享存储——届时两个并发的相同 Confirm 会同时 `find()` 未命中并同时 `save()`，把总账/SWIFT 输出重复入账。修复应与 C-2 一并进行：持久化存储必须对 **UNIQUE(origin_module, main_ref, sequence) 约束做原子 upsert**，并且 GL/SWIFT 副作用的生成要以"我是否赢得了这次插入"为准，而不是"find() 是否未命中"。

### H-2. 提交的腿金额未按币种小数位校验
**文件：** `validation/requestSchema.ts:22-24, 40`、`money.ts:113-115`

`MonetaryAmount` 只按 `^-?\d{1,18}(\.\d{1,3})?$` 校验。服务对它**自己计算**的金额会强制币种精度（`minorUnitsForCurrency`），却从不校验调用方**提交**的金额。于是 `JPY 100.50`（0 位小数币种给了 2 位）或 `EUR 1.234`（3 位）都会被接受，进入平衡汇总，最终要么破坏分币种平衡，要么被下游总账拒绝。币种小数精度本就在你自己的评审清单上。

**建议：** 在 `paymentLegInputSchema` 中把每个金额的小数位与 `minorUnitsForCurrency(leg.currency)` 交叉校验，超精度以 400 拒绝。

### H-3. MT103/pacs.008：结算金额(32A)=指示金额(33B) 在跨币种下是错的
**文件：** `domain/swiftMessages.ts:59-71`

`buildAdviceMessage` 把 `settlementAmount` 和 `instructedAmount` 设成同一个腿字段。代码注明这是源系统溯源来的（都来自 `CPYT_CR_AMT_CRCCY`），对**单一币种**支付没问题。但在真正的跨币种 MT103/pacs.008 里，**33B（指示金额）与 32A（行间结算金额）币种不同、且因 FX 换算而金额不同**——把两者设成相等是报文正确性缺陷，会被代理行/制裁筛查/gpi 流程挑出来。另外 `uetr` 在类型上声明了却**从未赋值**，而 CBPR+ pacs.008 与 gpi MT103 都强制要求 UETR；`serviceTypeId` / `isGpiMember` 同样从未设置。

**建议：** 把 32A 与 33B 作为两个独立值（结算币种/金额 vs 指示币种/金额）处理，并为每条出报文生成 UETR。即便完整 SWIFT 富化超出 demo 范围，也应把这些标为已知缺口，而不是以"相等"发布。

---

## 4. 中（Medium）

### M-1. 允许负数金额 + 仅做汇总平衡，可用"抵消"来凑平
**文件：** `money.ts:15`（格式里的 `-?`）、`balanceValidation.ts`

`MonetaryAmount` 允许负数。在复式记账里，方向由借/贷**方**表达，从不用负金额。由于 V8 只校验带符号的汇总，借方一条负数腿可以抵消另一条借方腿仍然"平衡"。建议拒绝提交腿的负金额（展开后的 FX 腿是系统生成、自平衡的，所以该约束可只作用于调用方输入）。

### M-2. 汇率允许为零、无正数/合理性上下界——会静默丢失一笔收费
**文件：** `money.ts:16, 41-46`、`suspenseBridge.ts:133-137`

`EXCHANGE_RATE_PATTERN` 接受 `"0"`。`crossRate` 为零会使 `trxEquivalent = 0`，`buildSuspenseBridgeLeg` 随即**返回 `null`（丢弃该腿）**——一笔真实收费无声消失、无任何报错。同时也没有上下界合理性校验（输错成 10000 的汇率会被静默入账）。建议增加 `rate > 0` 校验，并可按币种对增加合理区间带。

### M-3. `chargeComponentBridge` 差额配对：`diffNative` 与 `diffTrx` 符号可能不一致
**文件：** `suspenseBridge.ts:337-355`

该分支**以 `diffNative` 的符号做判断**（`greaterThan(0)` / `lessThan(0)`），却用**独立计算的 `diffTrx`** 来给交易币种腿定额。在多条部分抵消的腿之间，由于独立舍入，可能出现 `diffNative > 0` 而 `diffTrx <= 0`。此时 `buildFxPair` 会产出一条 `amountTxCcy` 为**负或零**的配对。它在汇总上仍平衡（自相抵消），所以 V8 抓不到——但凭证上出现负金额 FX 腿毫无意义、会干扰对账。建议对 `diffNative` 与 `diffTrx` 的符号一起判断（或断言其一致），并在任一为零时跳过。

### M-4. `sumLegsInCurrency` 在缺 `amountAccountCcy` 时回退用 `amountTxCcy` 当本币
**文件：** `suspenseBridge.ts:216-220`

当一条外币腿省略了 `amountAccountCcy`，代码用 `amountTxCcy`（以交易币种计价）当作本币金额去给 FX 配对定额——混用了两种币种。虽注明是回退，但对裸 API 调用方会静默产出错误的 FX 配对量。建议当 `leg.currency != transactionCurrency` 时**强制要求** `amountAccountCcy`，而不是回退。

### M-5. 无起息日/工作日校验
**文件：** `types.ts`（`valueDate?`）、`swiftMessages.ts`（透传）

`valueDate` 可选且从不校验——不检查超限倒起息，也不对照币种/RTGS 日历。起息日驱动 Nostro 头寸，对结算是控制关键。至少应校验格式且不过度倒起息，并按结算币种标记非工作日起息。

### M-6. 无冲正/反交易路径；`unpaidFlag` 未使用
**文件：** `confirmPaymentInstruction.ts`、`types.ts`（`unpaidFlag`、`unpaidAmountTxCcy`）

你的评审清单要求考虑冲正/异常处理。已确认的指令目前没有冲正或反向入账路径，`unpaidFlag`/`unpaidAmountTxCcy` 被携带却从不赋值或使用。对支付引擎而言，冲正（以及部分/未付处理）是核心生命周期状态，而非边角情形——即便暂缓实现，也应作为设计缺口标出。

### M-7. RPFM 的固定 ±0.01 容差作用于整张指令
**文件：** `confirmPaymentInstruction.ts:112`、`balanceValidation.ts:45-64`

RPFM 容差是对整张指令的单一绝对值 `0.01`，与发生了多少次 FX 换算（舍入）事件无关。FX 腿一多，合理的累计舍入就可能超过 0.01（误拒）；反过来一笔真实的 0.01 入账错误会被静默放过（误纳）。最佳实践是把容差与换算腿数量挂钩（如 `FX腿数 × 半个最小单位`），而非固定常量。

### M-8. 服务无传输层安全控制
**文件：** `app.ts`

`createApp` 接了 `express.json()` 和路由，但没有鉴权、没有 `express.json({ limit })` 报文上限、没有限流、也没有请求/追踪 ID 关联。demo 可接受，但对任何向总账入账的系统这都是基本要求，应列入生产化清单。

---

## 5. 低（Low）

- **L-1. 分录/腿/报文 ID 非 UUID。** `accountEntries.ts:24-28`、`voucherDescription.ts:111-115`、`swiftMessages.ts:46-50` 用模块级计数器 + `Date.now()`，跨实例易冲突、不确定；`instructionId` 已用 `randomUUID()`，此处应一致。
- **L-2. classify 预览要求 ≥1 条贷方腿。** `requestSchema.ts:130-134` 对 `creditLegs` 仍保留 `.min(1)`，导致 `chargeComponentBridge` 案例（贷方合法为空）无法使用预览端点——与已放宽的 Confirm 规则不一致。
- **L-3. `onConfirm()` 未对 `debitValid`/`creditValid` 做门禁。** `CLAUDE.md` 已记为既有的普遍缺口。值得独立于收费桥工作去修（任一侧无效时禁用 Confirm）。
- **L-4. 覆盖率排除模板/DOM。** README 指出 9 个原生自定义元素与所有 `.html` 模板不在 `collectCoverageFrom` 内；`CLAUDE.md` 里那次 `NG9` 模板编译事故正是会漏网的这类 bug——把"改模板后必须 `ng build`"作为 CI 强制项，而非仅靠约定。

---

## 6. 做得好的地方（请保持）

- 金额一律走 `money.ts` 单点、纯十进制运算——姿势正确，且难得。
- 通过 `Suspense - Credit` 清算科目干净分离 Charge ↔ Payment；不重复收费入账。
- FX 配对以"已舍入、已落报文"的金额定额——团队已诊断并移除了"先合并再换算"的漂移 bug（`suspenseBridge.ts` 的 v1.7.x 历史）。
- 幂等从一开始就纳入设计，并诚实注记了内存实现的局限。
- OAS 优先的类型定义、对有意偏离逐条留痕（V8、RTGS = NOSTRO+标志），以及有门禁的强测试套件。
- **分币种平衡通过 FX Exchange（汇兑头寸）科目硬控制**——所有换汇只经由该科目、以成对自平衡分录落账，
  故每个币别恒 Dr = Cr（由构造保证），而 V8 负责抓真实的聚合差额；CURRENCY VIEW 将其显式呈现。
  这是教科书式的多币种总账控制（也正是原 C-1 被撤回的原因）。

---

## 7. 建议的整改优先顺序

1. **C-2 / H-1** 报文感知、原子化的幂等（正确性 + 并发一起解决）。
2. **H-2** 对提交金额做币种精度校验。
3. **H-3** SWIFT 32A/33B 拆分 + UETR（若 SWIFT 输出在范围内）。
4. **M-1…M-8** 输入加固（负数金额、汇率界限）、FX 差额符号防护、起息日与冲正设计、容差模型、传输安全。
5. **L-1…L-4** 清理项。
