<div align="center">

[English](README.md) | [中文](README.zh.md)

# Knowledge Explorer

### Feishu Knowledge Base Analyzer

[![npm version](https://img.shields.io/npm/v/lark-knowledge-explorer.svg)](https://www.npmjs.com/package/lark-knowledge-explorer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)
[![lark-cli](https://img.shields.io/badge/lark--cli-required-blue.svg)](https://github.com/larksuite/cli)

Your Feishu docs are scattered notes with no connections between them.<br>
This tool uses AI to build relationships from scratch and find cross-topic insights you'd never think of.

[What Can I Do](#-what-can-i-do) · [Install](#-install) · [What It Discovers](#-what-it-discovers) · [Sample Output](#-sample-output) · [How It Works](#-how-it-works)

</div>

---

<!-- TODO: replace with actual GIF recording -->
<!-- <p align="center"><img src="docs/demo.gif" width="700" alt="Knowledge Explorer Demo"></p> -->

## Why?

Your Feishu knowledge base grows every day, but the connections between documents live only in your head.

- **No graph view** — Feishu has no Obsidian-like knowledge graph
- **Hidden duplicates** — teams write similar content in different spaces without knowing
- **Missed connections** — two unrelated docs might spark a brilliant idea when combined
- **Knowledge decay** — important docs go stale while still being heavily referenced

Knowledge Explorer fixes this by using AI to **build connections from scratch** — not just find existing links.

---

## 🎯 What Can I Do

After installing the Skill, just tell your AI agent what you want in natural language.

### Scan & Analyze

| You say | AI does |
|---------|---------|
| "Analyze my knowledge base" | Scans all wiki spaces, generates a full report |
| "Analyze docs about product strategy" | Searches by keyword and analyzes matches |
| "Only look at my own docs" | Filters to docs you own |
| "Only look at other people's docs" | Excludes your docs, analyzes others' |
| "Only analyze the XX space" | Scans within a specific wiki space |
| "Only the YY folder under XX space" | Narrows down to a folder and its subfolders |

These filters **can be freely combined**, e.g. "Analyze my docs in the Product space about user growth".

### Helper Queries

| You say | AI does |
|---------|---------|
| "What wiki spaces do I have?" | Lists all accessible spaces with IDs |
| "Show the folder structure of XX space" | Displays the folder tree so you can pick a scope |

### Supported Document Types

| Type | Status |
|------|--------|
| Docs (docx) | Full scan + analysis |
| Legacy docs (doc) | Full scan + analysis |
| Sheets / Bases / Slides / Mindnotes | Skipped (no body text) |

---

## ✨ What It Discovers

Each analysis produces a **Feishu document report** containing:

| | Discovery | Description |
|---|---|---|
| 🏛 | **Hub Documents** | Heavily referenced knowledge anchors, e.g. *"Q1 Planning" is cited by 4 docs and semantically linked to 8 more* |
| 🏝 | **Orphan Documents** | Zero connections to anything — consider archiving or linking |
| 🌉 | **Bridge Documents** | Connectors across topics, e.g. *"User Research" links the Product and Marketing clusters* |
| ⏰ | **Stale Documents** | Not updated in months but still heavily cited — time to refresh |
| 🔗 | **Topic Clusters** | AI groups your docs into themes like #UserGrowth, #TechDebt, #CompetitorIntel |
| 💡 | **Collision Insights** | Cross-topic document pairs with actionable suggestions for combining them |

**Collision Insights** are the killer feature — they don't just say "these two docs are similar", they say "put these together and you can build XX".

### Reports Also Include

- **Knowledge health advice** — which docs to merge, update, or connect
- **Action checklist** — checkable to-dos right inside the Feishu document

---

## 🚀 Install

### As an AI Agent Skill (Recommended)

Works with Claude Code, Codex, and other coding agents. Chat-driven analysis, **zero API config**.

Send this to your AI agent and it will handle the entire setup:

> Help me install Knowledge Explorer (Feishu knowledge base analyzer). Execute in order:
>
> 1. Check Node.js >= 20 is installed; if not, tell me to install it manually
> 2. `npm install -g @larksuite/cli`
> 3. `npm install -g lark-knowledge-explorer`
> 4. Run `lark-cli auth login --scope search:docs_wiki:readonly,wiki:node:read,docx:document:readonly,docx:document` — this step requires me to authorize in the browser, wait for me to finish
> 5. Install the Skill files from the npm global package to your skills directory: source path `$(npm root -g)/lark-knowledge-explorer/` (need SKILL.md and references/)
>
> Once done, tell me what I can say to trigger a knowledge base analysis.

After that, just say "analyze my knowledge base" and you're off.

### As a Standalone CLI Tool

If you don't use an AI agent, you can run commands directly. Requires an AI API:

```bash
# Install
npm install -g lark-knowledge-explorer

# Configure AI (supports OpenAI, Qwen, DeepSeek, etc.)
echo "OPENAI_API_KEY=sk-xxx" > .env
echo "OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1" >> .env

# Run
npx knowledge-explorer
```

<details>
<summary><b>All CLI Options</b></summary>

| Option | Description |
|--------|-------------|
| `--collect-only` | Collect docs to cache (no AI needed) |
| `--analyze-only` | Analyze cached docs (needs API key) |
| `--render-only` | Render cached results to terminal + Feishu doc |
| `--analyze-prompt` | Generate analysis prompt for copy-paste to any AI |
| `--query <keyword>` | Keyword search mode (instead of full scan) |
| `--owner me\|others\|<name>` | Filter by document owner |
| `--space <space_id>` | Limit to specific wiki space |
| `--folder <node_token>` | Limit to a folder subtree (requires `--space`) |
| `--max-pages <n>` | Max search pages (default: 10) |
| `--list-spaces` | List all accessible wiki spaces |
| `--list-tree <space_id>` | Show folder tree of a space (find node tokens for `--folder`) |

**Environment Variables** (auto-loaded from `.env`):

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI-compatible API key | — |
| `OPENAI_BASE_URL` | Custom endpoint | `https://api.openai.com/v1` |
| `AI_MODEL` | Model name | `gpt-4o-mini` |

</details>

---

## 📊 Sample Output

```
🔍 Scan complete: 14 documents

📊 Knowledge Health
  🏛 Hub docs (9): MBTI Personality & Study Abroad, Event Planning, etc.
  🌉 Bridge docs (9): Knowledge Report, MBTI Personality, etc.
  ⏰ Possibly stale (3): Holiday Study Guide, IP Growth Training, Community Plan

🔗 Found 6 topic clusters
  ├ #StudyAbroadPaths (4 docs)
  │   · Knowledge Exploration Report 2026-04-05
  │   · INFP | MBTI Personality & Study Abroad Paths
  │   · ...
  ├ #ReadingSkills (4 docs)
  │   · Original Reading Club Handbook
  │   · Reading Workshop Plan
  │   · ...
  └ #AIReadingWorkshop (2 docs)
      · Cognitive Radar Prompt Lab
      · "Information Overload Terminator"

💡 Collision Insights (Top 5)
  1. "Knowledge Report" × "MBTI Event Plan"
     → Embed the MBTI-study path knowledge graph into a 7-day campaign
     Doc A provides structured personality-environment matching; Doc B has a proven outreach funnel...
  2. "Cognitive Radar Prompt Lab" × "Holiday Study Guide"
     → Launch a biweekly reading sprint with constructive reading prompt workflows...

📄 Full report generated → https://feishu.cn/docx/xxx
```

Beyond the terminal output, a **full Feishu document** is auto-created with clickable doc links and a checkable action list.

---

## ⚙️ How It Works

```
  Collect docs       Build graph        Gen insights       Output report
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ Traverse  │──→│ AI summary│──→│ Hubs     │──→│ Terminal │
│ spaces +  │   │ Semantic  │   │ Orphans  │   │ Feishu   │
│ fetch docs│   │ clustering│   │ Collisons│   │ Checklist│
└──────────┘   └──────────┘   └──────────┘   └──────────┘
```

**Semantic-first architecture**: Instead of finding existing links, the tool uses AI to understand content and build connections from scratch — because most personal knowledge bases have few or no explicit cross-references.

### Tech Stack

- **TypeScript** — CLI core
- **[lark-cli](https://github.com/larksuite/cli)** — Feishu API layer
- **OpenAI-compatible API** — AI analysis (Qwen, DeepSeek, GPT, etc.)
- **Pure JSON caching** — no database dependency

---

## 🤝 Contributing

Contributions welcome! If you find a bug or have feature ideas:

1. [Open an Issue](https://github.com/coni555/lark-knowledge-explorer/issues)
2. Fork → branch → PR

For major changes, please open an issue first to discuss.

## 📈 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=coni555/lark-knowledge-explorer&type=Date)](https://star-history.com/#coni555/lark-knowledge-explorer&Date)

## License

[MIT](LICENSE)

---

<div align="center">

**Built for the [lark-cli Creator Contest](https://waytoagi.feishu.cn/wiki/R4S3w8wTTie04nkYiL6c8rxon4d)** · If this is useful, please star ⭐

Thanks to [lark-cli](https://github.com/larksuite/cli) for making Feishu API accessible from the terminal.<br>
And thank you to everyone who starred this project — your support means a lot.

</div>
