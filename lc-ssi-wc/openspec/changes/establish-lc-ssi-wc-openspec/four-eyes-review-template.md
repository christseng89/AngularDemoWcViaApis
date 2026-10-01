# Four-eyes Review Template — Non-authoritative Repository Copy

This file is a review checklist only. It MUST NOT contain or be cited as the authoritative approval of the commit that contains it. The exact candidate commit and final Independent Checker verdict belong in external handoff/review evidence.

## Candidate Identity

- Repository path:
- Candidate commit:
- Branch:
- Review date/time and timezone:
- Maker identity:
- Independent Checker identity:

## Independent Checks

- [ ] Required governance sources were read and archive-isolated content was excluded.
- [ ] `openspec list` identifies the intended active change.
- [ ] `openspec list --specs` identifies all intended current capabilities.
- [ ] `openspec status --change establish-lc-ssi-wc-openspec` is complete for the declared workflow.
- [ ] `openspec validate --all --strict --no-interactive` passes all items.
- [ ] Requirement and scenario identifiers are unique.
- [ ] Every traceability path exists and no archive-isolated path is cited.
- [ ] Current specs describe implemented observable behaviour only.
- [ ] OAS and evidence gaps are recorded without being presented as PASS.
- [ ] Maker and Checker are distinct and the Checker made no changes to the candidate.
- [ ] Git diff contains only authorised OpenSpec/plan files.

## Verdict Vocabulary

- `PASS`: exact candidate independently satisfies all checks.
- `CHANGES_REQUIRED`: one or more findings must be corrected; any correction creates a new candidate requiring full re-review.
- `BLOCKED`: evidence or environment prevents a defensible verdict.

## Limitation

An AI-assisted review is not a formal human BA, QA, DBA, governance or regulatory approval.
