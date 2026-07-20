#!/bin/bash
# ══════════════════════════════════════════════════════════════
# LC Issue Demo — 一鍵安裝並啟動
# 需求: Node.js 18+ / npm 9+
# ══════════════════════════════════════════════════════════════

set -e
echo "🏦 LC Issue Demo — Angular + Formly + Web Components"
echo "────────────────────────────────────────────────────"

# 1. Install dependencies
echo "📦 安裝相依套件 (npm install)..."
npm install

# 2. Start dev server
echo "🚀 啟動開發伺服器 (ng serve)..."
echo "    → http://localhost:4200"
npx ng serve --open
