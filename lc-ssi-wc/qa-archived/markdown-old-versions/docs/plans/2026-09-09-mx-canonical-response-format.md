# MX Canonical Response Format Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep payment SSI resolution MX-native while allowing the caller to choose an MT 5x-tag response or an MX pacs-element response.

**Architecture:** Eligibility, route ranking, RMA and confirmation continue to use the upstream `pacs.*` message and one confirmed canonical settlement. A presentation-only response renderer maps that same snapshot to either the applicable MT fields or MX elements; it never changes the route or evidence.

**Tech Stack:** Angular, TypeScript, NestJS, Jest, Nx

---

## Understanding and assumptions

- MX (`pacs.008` or `pacs.009`) is the only resolution and RMA model.
- `MT` and `MX` are response-format choices, not routing keys.
- An MT response contains only fields valid for the derived MT message profile.
- An MX response contains pacs elements from the same confirmed canonical settlement.
- The existing third-party MT/MX converter is outside SSI scope and is mentioned only as guidance.
- No conversion engine or second resolution path will be added.

## Decision log

- Chosen: MX canonical plus a response renderer.
- Rejected: invoking a third-party converter from SSI, because that couples conversion to resolution.
- Rejected: returning both formats, because it complicates the response without a business need.

### Task 1: Lock response-rendering behavior with tests

**Files:**
- Modify: `libs/domain/src/lib/payment-settlement-profile.test.ts`

1. Assert that an MT103 response contains applicable `53A`, `57A` and `59`, but no `58A`.
2. Assert that an MT202 response contains applicable `53A`, `57A` and `58A`, but no `59`.
3. Assert that an MX response contains pacs creditor-agent/customer elements and no MT tag keys.
4. Run `npx nx test domain --runInBand`; expect the new MX assertion to fail before implementation if behavior is incomplete.

### Task 2: Keep one canonical renderer

**Files:**
- Modify: `libs/domain/src/lib/payment-settlement-profile.ts`

1. Retain `renderPaymentSettlement(format, settlement)` as the single format boundary.
2. Filter empty values from both MT and MX payloads.
3. Keep MT103/MT202 field selection profile-specific.
4. Run `npx nx test domain --runInBand`; expect PASS.

### Task 3: Simplify response-format UI language

**Files:**
- Modify: `apps/ssi-portal/src/app/app.component.html`
- Test: `libs/domain/src/lib/payment-settlement-profile.test.ts`

1. Rename the selector to `Response format／回覆格式`.
2. Label choices as `MT — 5x Tags` and `MX — pacs.*` while preserving the exact derived MT/pacs message in the preview.
3. State briefly that MX drives resolution/RMA and the selection changes only the response payload.
4. Keep the existing confirmed snapshot and route unchanged when toggling the format.

### Task 4: Validate the completed change

**Files:**
- Verify: `apps/ssi-portal/src/app/app.component.html`
- Verify: `libs/domain/src/lib/payment-settlement-profile.ts`

1. Run `npx nx run-many -t typecheck --projects=domain,ssi-portal --parallel=2`; expect PASS.
2. Run `npx nx run-many -t test --projects=domain,ssi-portal --parallel=2 --runInBand`; expect PASS.
3. Run `npm run lint`; expect PASS.
4. Run `npm audit --audit-level=high`; expect no high/critical audit failure.
5. Verify in the browser that Customer shows `pacs.008`/MT103 and Bank shows `pacs.009`/MT202, with the response payload changing but the route/RMA context unchanged.
