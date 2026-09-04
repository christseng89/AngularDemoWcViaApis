---
title: "Vault Conventions"
type: governance
domain: documentation
status: verified
source_of_truth: source-code
source_revision: "1865d80"
verified_date: 2026-09-04
generated: true
aliases: []
tags: ["documentation"]
source_files:
  - "scripts/rebuild-obsidian-kb.mjs"
---

# Vault Conventions

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Properties

每篇筆記使用一致的 `type`、`domain`、`status`、`source_files`、`source_revision`、`verified_date` 與 `generated`。

## Linking

使用 Obsidian Wiki links 連至 canonical notes。MOC 是導航入口；不得複製整段規則。

## Regeneration

執行 `node scripts/rebuild-obsidian-kb.mjs --write`。此命令只重建本 vault 的 Markdown，保留 folder。
