# Excess Policy Configuration

`excess-policy.non-production.json` is a development and regression fixture only. Its allowance percentages and USD caps are illustrative, not production business values.

Production deployment must supply a separately reviewed effective-dated configuration with both owner types. Every policy is fail-closed and snapshots its version, currency precisions, rate scale and `ROUND_HALF_UP` rule. `pbdFallbackPolicy` is mandatory: `authorized:false` requires null identity／dates, while `authorized:true` requires a non-empty policy ID／version and an effective interval. The production Currency Exchange adapter accepts only provider-supplied `BOOKING` rates; this configuration cannot enable midpoint or alternate-rate fallback.
