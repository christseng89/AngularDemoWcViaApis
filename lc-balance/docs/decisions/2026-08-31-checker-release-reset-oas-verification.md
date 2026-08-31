# Checker Release screen reset — OAS verification

- Microservice OAS: `analysis/balance-component-api.yaml` v1.42.1
- Channel OAS: `analysis/balance-component-channel-api.yaml` v1.9.0
- Scope: client-side state transition after a successful Checker Release
- Result: no endpoint, request, response, error, or event wire change; both OAS versions remain unchanged

All A1-A11 and B1-B7 functions now clear stale Maker/Checker UI state after Release. POST retry behavior remains disabled and is not changed by this reset.
