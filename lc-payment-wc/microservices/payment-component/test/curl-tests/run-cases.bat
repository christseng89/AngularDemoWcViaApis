@echo off
REM ============================================================================
REM  Two worked-example Confirm requests against POST /payment-component/v1/payment-instructions
REM
REM  Case 1: Suspense Debit (10 USD + 20 USD + 12 EUR Charge) + Suspense Credit
REM          (35 USD Charge), Debit Legs mixed EUR/USD, single USD NOSTRO credit leg.
REM  Case 2: Same debitLegs/suspenseBridge as Case 1, but creditLegs split across
REM          a EUR NOSTRO leg (1000/1083.08) + a USD NOSTRO leg (8881.92) instead
REM          of one plain USD leg. The EUR credit leg has no matching EUR entry in
REM          suspenseBridge.creditEntries, so no FX Exchange pair is auto-generated
REM          for it - confirmed against a live run.
REM
REM  Prerequisites: microservice running on :3000 (cd ../.. && npm run dev)
REM  Deliberately flat, no subroutines/loops - just two sequential curl calls.
REM ============================================================================

set "BASE_URL=http://localhost:3000/payment-component/v1"
set "REQ_DIR=%~dp0requests"

echo === Case 1 ===
curl -s -w "HTTP Status: %%{http_code}\n" -X POST "%BASE_URL%/payment-instructions" -H "Content-Type: application/json" --data "@%REQ_DIR%\case1-suspense-fx-and-nostro-usd.json"
echo.

echo === Case 2 ===
curl -s -w "HTTP Status: %%{http_code}\n" -X POST "%BASE_URL%/payment-instructions" -H "Content-Type: application/json" --data "@%REQ_DIR%\case2-suspense-fx-and-nostro-eur-usd-split.json"
echo.
