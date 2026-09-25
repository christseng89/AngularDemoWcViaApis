# MT2 / pacs.009 Proposal QA

The active MT2 acceptance source is the approved Outward SSI Resolve Only
Proposal. Its controlled case catalogue is:

`data/qa/mt2/mt2-pacs009-proposal-case-groups.json`

Each SSI routing decision case has one deterministic oracle and a distinct controlled
execution binding in:

`data/qa/mt2/mt2-pacs009-proposal-fixtures.json`

`npm run qa:mt2:cases` runs all named Jest assertions without the Nx cache
and records each assertion's own PASS/FAIL result. A suite-level exit code is
never expanded into case-level evidence.

Run the current gates with:

```bash
npm run qa:mt2:cases
npm run qa:mt2:final:unit
npm run qa:mt2:final
```

Superseded workbooks, runners and evidence are archived under the Git-ignored
`qa-archived/` directory and are not active validation dependencies.
