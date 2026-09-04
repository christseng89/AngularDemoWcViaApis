# OpenSpec Bootstrap Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Initialize the official OpenSpec workflow and derive current-state Balance Component specifications without modifying existing files other than `CLAUDE.md`.

**Architecture:** Keep official OpenSpec artifacts at repository-root `openspec/`. Treat `openspec/specs/` as observable AS-IS behavior derived from approved decisions, OAS, tests, Obsidian, and implementation evidence; keep future configuration-first product expansion in an explicit change proposal rather than current-state specs.

**Tech Stack:** OpenSpec CLI, Markdown requirements and Given/When/Then scenarios, YAML project configuration, existing Node.js documentation validation.

---

### Task 1: Initialize official OpenSpec structure

**Files:**
- Create: `openspec/config.yaml`
- Create: `openspec/specs/`
- Create: `openspec/changes/archive/`
- Create: OpenSpec workflow files selected for Claude Code and Codex

1. Verify Node.js satisfies OpenSpec's minimum version.
2. Install and verify the official OpenSpec CLI.
3. Inspect for legacy OpenSpec artifacts before initialization.
4. Run official initialization for Claude Code and Codex.
5. Confirm initialization did not modify pre-existing files.

### Task 2: Add repository verification gate

**Files:**
- Modify: `CLAUDE.md`

1. Add a project-defined OpenSpec Professional Verification Gate without claiming official certification.
2. Define authority order, current-spec versus change-delta rules, scenario requirements, traceability, and validation expectations.
3. Confirm no other pre-existing file changed.

### Task 3: Derive current-state capability specifications

**Files:**
- Create: `openspec/specs/*/spec.md`

1. Inventory implemented capabilities from Source Code, tests, OAS, and Obsidian.
2. Write observable SHALL requirements with testable Given/When/Then scenarios.
3. Cover lifecycle, Maker/Checker, balance calculations, earmarks, accounting, tolerance/money, APIs, automation, configuration, and UI integration.
4. Mark unresolved conflicts as gaps instead of inventing behavior.

### Task 4: Record future product configuration architecture

**Files:**
- Create: `openspec/changes/configuration-first-product-extension/*`

1. Write the proposal and delta specification for future SBLC/LG-ready product configuration.
2. Record design boundaries between configuration, typed Product Policy plug-ins, and immutable Balance Core controls.
3. Write implementation tasks without changing product behavior.

### Task 5: Validate

1. Run official OpenSpec validation for all specs and changes.
2. Check Markdown structure and internal references.
3. Run the repository documentation verifier.
4. Compare Git changes and confirm only new files plus `CLAUDE.md` were changed by this task.

