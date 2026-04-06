<div align="center">

[English](README.md) | [中文](README.zh.md)

# Knowledge Explorer

### 飞书知识探索器

[![npm version](https://img.shields.io/npm/v/lark-knowledge-explorer.svg)](https://www.npmjs.com/package/lark-knowledge-explorer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)
[![lark-cli](https://img.shields.io/badge/lark--cli-required-blue.svg)](https://github.com/larksuite/cli)

Scan your Feishu knowledge base, discover hidden relationships between documents,<br>
and generate actionable insights — all from a single command.

[Quick Start](#-quick-start) · [Features](#-what-it-discovers) · [Two Modes](#-two-analysis-modes) · [How It Works](#-how-it-works) · [As a Skill](#-use-as-ai-agent-skill) · [Contributing](#-contributing)

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

## ✨ What It Discovers

| | Type | Example |
|---|---|---|
| 🏛 | **Hub Documents** | *"Q1 Planning" is cited by 4 docs and semantically linked to 8 more — your knowledge anchor* |
| 🏝 | **Orphan Documents** | *5 docs have zero connections — consider archiving or linking* |
| 🌉 | **Bridge Documents** | *"User Research" connects the Product and Marketing clusters* |
| ⏰ | **Stale Documents** | *"Competitor Analysis" hasn't been updated in 89 days but 3 docs still cite it* |
| 🔗 | **Topic Clusters** | *AI groups your docs into themes like #UserGrowth, #TechDebt, #CompetitorIntel* |
| 💡 | **Collision Insights** | *"Competitor Pricing" × "User Interviews" → design a tiered pricing strategy* |

**Collision Insights** are the killer feature — they find documents from different clusters that share hidden connections, and suggest how combining them creates new value.

## 🚀 Quick Start

### Prerequisites

- [lark-cli](https://github.com/larksuite/cli) installed and logged in
- Node.js >= 20

### Install

```bash
# Via npm (recommended)
npm install -g lark-knowledge-explorer

# Or from source
git clone https://github.com/coni555/lark-knowledge-explorer.git
cd knowledge-explorer
npm install && npm run build
```

### Run

```bash
# Option A: Let your AI agent analyze (zero API config)
npx knowledge-explorer --collect-only
# → Then ask your AI agent to read .knowledge-cache/ and analyze

# Option B: Fully automated with AI API
echo "OPENAI_API_KEY=sk-xxx" > .env
echo "OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1" >> .env
npx knowledge-explorer
```

That's it. Terminal report + Feishu doc auto-generated.

## 🔀 Two Analysis Modes

| | Coding Agent (Path A) | API Pipeline (Path B) |
|---|---|---|
| **Setup** | Zero config | Needs `OPENAI_API_KEY` |
| **How** | `--collect-only` → AI agent analyzes cache → `--render-only` | Single command, fully automated |
| **Best for** | AI agent users (Claude Code, Codex, etc.) | Batch runs, CI/CD |
| **Cost** | Your AI agent subscription | API token costs |

### Path A: Coding Agent

```bash
npx knowledge-explorer --collect-only          # Step 1: Collect docs
# AI agent reads .knowledge-cache/nodes.json   # Step 2: AI analysis
npx knowledge-explorer --render-only           # Step 3: Render report
```

### Path B: API Pipeline

```bash
npx knowledge-explorer                         # Full scan + AI + output
npx knowledge-explorer --query "产品规划"       # Keyword search
npx knowledge-explorer --owner me              # Only my docs
```

<details>
<summary><b>All CLI Options</b></summary>

| Option | Description |
|--------|-------------|
| `--collect-only` | Collect docs to cache (no AI needed) |
| `--analyze-only` | Analyze cached docs (needs API key) |
| `--render-only` | Render cached results to terminal + Feishu doc |
| `--query <keyword>` | Keyword search mode (instead of full scan) |
| `--owner me\|others\|<name>` | Filter by document owner |
| `--space <space_id>` | Limit to specific wiki space |
| `--max-pages <n>` | Max search pages (default: 10) |
| `--list-spaces` | List all accessible spaces |

**Environment Variables** (auto-loaded from `.env`):

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI-compatible API key | — |
| `OPENAI_BASE_URL` | Custom endpoint | `https://api.openai.com/v1` |
| `AI_MODEL` | Model name | `gpt-4o-mini` |

</details>

## 📊 Sample Output

```
🔍 扫描完成：14 篇文档

📊 知识健康度
  🏛 枢纽文档 (9)：MBTI人格与留学路径选择、活动策划方案 等
  🌉 桥梁文档 (9)：知识探索报告、MBTI人格与留学路径选择 等
  ⏰ 可能过期 (3)：假期充电站、IP增长项目培训、鹅圈子学院方案

🔗 发现 6 个主题聚类
  ├ #留学路径适配 (4篇)
  │   · 知识探索报告 2026-04-05
  │   · INFP|不同MBTI人格与留学路径选择
  │   · ...
  ├ #阅读力提升 (4篇)
  │   · 「原著阅读俱乐部」学习手册
  │   · 浪前·阅读力工坊-策划案
  │   · ...
  └ #AI阅读工坊 (2篇)
      · 认知雷达 Prompt 实验室
      · 《信息过载终结者》

💡 碰撞洞察 (Top 5)
  1.《知识探索报告》×《MBTI情报局活动策划方案》
     → 将 MBTI-留学路径知识图谱嵌入7天线上活动，生成个性化匹配建议
     文档A提供结构化的人格-环境匹配知识资产，文档B具备成熟的私域触达路径...
  2.《认知雷达 Prompt 实验室》×《假期充电站》
     → 联合发起双周共读行动，用构建式阅读设计 Prompt 任务流...

📄 完整报告已生成 → https://feishu.cn/docx/xxx
```

## ⚙️ How It Works

```
                    ┌─────────────────────────────────┐
                    │  Phase 1: Collect                │
                    │  Traverse wiki spaces + search   │
                    │  via lark-cli                    │
                    └──────────────┬──────────────────┘
                                   ↓
                    ┌─────────────────────────────────┐
                    │  Phase 2: Build Graph            │
                    │  AI summaries → semantic         │
                    │  clustering → auto-generate edges│
                    └──────────────┬──────────────────┘
                                   ↓
                    ┌─────────────────────────────────┐
                    │  Phase 3: Generate Insights      │
                    │  L1 structural → L2 semantic     │
                    │  → L3 collision                  │
                    └──────────────┬──────────────────┘
                                   ↓
                    ┌─────────────────────────────────┐
                    │  Phase 4: Output                 │
                    │  Terminal report + Feishu doc    │
                    │  (auto-created)                  │
                    └─────────────────────────────────┘
```

**Semantic-first architecture**: Instead of finding existing links, the tool uses AI to understand content and build connections from scratch — because most personal knowledge bases have few or no explicit cross-references.

## 🛠 Tech Stack

- **TypeScript** — CLI core
- **[lark-cli](https://github.com/larksuite/cli)** — Feishu API layer
- **OpenAI-compatible API** — AI analysis (Qwen, DeepSeek, GPT, etc.)
- **Pure JSON caching** — no database dependency

## 🤖 Use as AI Agent Skill

Knowledge Explorer ships with a `SKILL.md` that works with any coding AI agent (Claude Code, Codex, etc.). Install it to let your AI agent explore Feishu knowledge bases conversationally:

```bash
# Example: Claude Code
cp -r knowledge-explorer ~/.claude/skills/knowledge-explorer
```

The skill supports both analysis modes — your AI agent can either run the full API pipeline or do the analysis itself using cached documents.

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
