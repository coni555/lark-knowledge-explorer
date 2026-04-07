---
name: knowledge-explorer
description: >-
  Feishu/Lark knowledge base analyzer: scans wiki spaces and Drive folders,
  discovers hidden document relationships via semantic clustering, and generates
  collision insights (cross-topic document pairs that spark new ideas). Supports
  wiki spaces (--space), Drive cloud folders (--drive), and keyword search (--query).
  Two modes: Coding Agent (default, zero config — you collect docs, analyze them
  yourself, then render) and API Pipeline (needs OPENAI_API_KEY, fully automated).
  If user mentions 知识图谱, 知识库分析, 文档关系, 碰撞洞察, 孤岛文档, 知识健康,
  云盘分析, 扫描云盘, scan my drive, explore my docs, scan my wiki, find document
  connections, or analyze knowledge base, MUST use this skill.
  Do NOT use for: reading/editing a single Feishu doc (use lark-doc),
  querying spreadsheets (use lark-sheets), managing wiki structure (use lark-wiki),
  or operating on Feishu bases (use lark-base).
user_invocable: true
metadata:
  requires:
    bins: ["lark-cli", "node"]
---

# Knowledge Explorer — 飞书知识探索器

> **Prerequisites:** lark-cli logged in (`lark-cli auth login`) · Node.js >= 20 · `npm install -g lark-knowledge-explorer`

## Mode Decision

```
User wants to analyze knowledge base
  │
  ├─ Has OPENAI_API_KEY in .env? ──→ Path B: API Pipeline (one command)
  │
  └─ No API key (default) ──→ Path A: Coding Agent (you do the analysis)
```

If unsure, **default to Path A** — it works without any API config.

---

## Path A: Coding Agent (Default)

You handle the full workflow automatically. The user just says "analyze my knowledge base" and you do the rest.

### Step 1 — Collect Documents

```bash
npx knowledge-explorer --collect-only
```

Optional flags: `--query "keyword"`, `--owner me`, `--space <id>`, `--folder <node_token>` (requires `--space <id>`), `--drive [folder_token]`, `--minutes`, `--minutes-days <n>`, `--max-pages <n>`.

**Source selection:** Use `--space` for wiki spaces, `--drive` for Drive cloud folders. They cannot be combined.

Helper tools:

```bash
npx knowledge-explorer --list-spaces              # wiki spaces
npx knowledge-explorer --list-tree <space_id>      # wiki folder tree
npx knowledge-explorer --list-drive                # Drive root folder tree
npx knowledge-explorer --list-drive <folder_token> # Drive subfolder tree
```

Use `--list-spaces` to find the target `space_id`. Use `--list-tree <space_id>` to inspect that space's folder tree and copy the folder `node_token`, then collect with `--space <space_id> --folder <node_token>`.

Use `--list-drive` to browse Drive folders and find the `folder_token`, then collect with `--drive <folder_token>`. Omit the token to scan the entire Drive root.

Wait for `✓ 收集完成，N 篇文档已缓存` before proceeding.

### Step 2 — Analyze (You)

Read `.knowledge-cache/nodes.json` and execute the full analysis protocol.

Complete protocol with rules and quality requirements: see `references/analysis-protocol.md`.

Summary of what you do:

1. **Summarize** each doc (≤100 chars) + extract 5-8 keywords → write `summaries.json`
2. **Cluster** docs by theme (ceil(N/4) ~ ceil(N/2) groups, ≤5 per group) → write `clusters.json`
3. **Build edges** between docs in same cluster → write `edges.json`
4. **Structural insights** — find hubs, orphans, bridges, stale docs → write `structural_insights.json`
5. **Semantic insights** — per-cluster themes, contradictions, duplicates → write `semantic_insights.json`
6. **Collision insights** — 3-5 cross-cluster doc pairs with actionable suggestions → write `collision_insights.json`

All files written to `.knowledge-cache/`. JSON schemas: see `references/cache-schema.md`.

Report progress to user after each sub-step. Collision insights are the core value — make them specific and actionable.

### Step 3 — Render Report

```bash
npx knowledge-explorer --render-only
```

This outputs a colored terminal report and auto-creates a Feishu document. Return the Feishu doc link to the user.

---

## Path B: API Pipeline

For users with an OpenAI-compatible API key configured.

```bash
# Full scan + AI analysis + output (one command)
npx knowledge-explorer

# With options
npx knowledge-explorer --query "产品规划"    # Keyword search
npx knowledge-explorer --owner me           # Only my docs
```

Environment variables (auto-loaded from `.env`):

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI-compatible API key | — |
| `OPENAI_BASE_URL` | Custom endpoint | `https://api.openai.com/v1` |
| `AI_MODEL` | Model name | `gpt-4o-mini` |

Also supports staged execution: `--collect-only` → `--analyze-only` → `--render-only`.

---

## CLI Quick Reference

| Flag | Description |
|------|-------------|
| `--collect-only` | Collect docs to cache (no AI needed) |
| `--analyze-only` | Analyze cached docs (needs API key) |
| `--render-only` | Render cached results to terminal + Feishu doc |
| `--analyze-prompt` | Generate analysis prompt for copy-paste |
| `--query <keyword>` | Keyword search mode (instead of full scan) |
| `--owner me\|others\|<name>` | Filter by document owner |
| `--space <space_id>` | Limit to specific wiki space |
| `--folder <node_token>` | Limit full scan to a folder subtree (requires `--space`) |
| `--max-pages <n>` | Max search pages (default: 10) |
| `--list-spaces` | List all accessible wiki spaces |
| `--list-tree <space_id>` | Show folder tree for a wiki space |
| `--drive [folder_token]` | Scan Feishu Drive folders (default: root) |
| `--list-drive [folder_token]` | Show Drive folder tree |
| `--minutes` | Also collect meeting minutes (combinable with any mode) |
| `--minutes-days <n>` | How far back to search meetings (default: 30) |

For full details: `references/cli-reference.md`.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `未找到任何文档` | lark-cli not logged in or missing scope | `lark-cli auth login --scope search:docs_wiki:readonly,wiki:node:read,docx:document:readonly,docx:document,drive:drive:readonly` |
| `AI not configured` | Missing API key (Path B only) | Check `.env` or switch to Path A |
| `429 Too Many Requests` | API rate limit | Wait a few minutes, or switch API key |
| Clusters too few (≤2) | Too few docs or topics too similar | Broaden search (remove `--query`) |
| Feishu doc creation failed | Missing `docx:document` scope | `lark-cli auth login --scope docx:document` |
| `nodes.json` has no content | Ran default mode, not `--collect-only` | Re-run with `--collect-only` (preserves content for Path A) |
| `--drive` finds 0 docs | Folder contains only shortcuts to non-doc types | Use `--list-drive` to check file types; shortcuts to docx/doc are auto-resolved |
| `getRootFolderToken failed` | Missing Drive scope | `lark-cli auth login --scope drive:drive:readonly` |
