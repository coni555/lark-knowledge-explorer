---
name: knowledge-explorer
description: "Scan Feishu/Lark knowledge bases to discover hidden document relationships via AI semantic clustering, then generate collision insights and actionable suggestions. Supports two modes: Claude-direct analysis (zero API config) and external API pipeline. Use when user mentions 知识图谱, 文档关系, 知识库分析, 知识健康度, 孤岛文档, explore my docs, scan my wiki, or wants to find connections between existing documents. Do NOT use for: reading/editing a single Feishu doc (use lark-doc), querying Feishu spreadsheets (use lark-sheets), or managing wiki structure (use lark-wiki)."
metadata:
  requires:
    bins: ["lark-cli", "node"]
---

# Knowledge Explorer — 飞书知识探索器

> 前置：lark-cli 已登录（`lark-cli auth login`）、Node.js >= 20、项目目录 `~/Desktop/knowledge-explorer/`

## Mode Decision

Pick the right mode based on context:

- **Claude-direct（Path A）** — 用户没有 API key，或希望你直接分析。三步分离：collect → 你来分析 → render。
- **API pipeline（Path B）** — 用户有 OpenAI 兼容 key（通义千问/DeepSeek 等）。一条命令全自动。

如果不确定，问一句："你有通义千问或其他 AI API key 吗？没有的话我直接帮你分析。"

## Path A: Claude-Direct Analysis

### Step 1 — Collect

```bash
cd ~/Desktop/knowledge-explorer
npx knowledge-explorer --collect-only             # 全量扫描
npx knowledge-explorer --collect-only --query "关键词"  # 关键词搜索
```

可选 flags: `--owner me`, `--space <id>`, `--max-pages <n>`。
For full CLI reference, see `references/cli-reference.md`.

确认输出 `✓ 收集完成，N 篇文档已缓存` 后进入 Step 2。

### Step 2 — Analyze (You)

读取 `.knowledge-cache/nodes.json`，对缓存文档执行以下分析，逐步写入缓存文件。

每个缓存文件的 JSON schema 见 `references/cache-schema.md`。

1. **摘要 + 关键词** — 逐篇读 content，生成 summary（≤100字）和 keywords（5-8个，分主题/领域/实体三层）。写入 `summaries.json`。
2. **语义聚类** — 根据所有摘要，按主题分组（目标 `ceil(N/4)` ~ `ceil(N/2)` 组，每组≤5篇，宁可多分不要硬凑）。写入 `clusters.json`。
3. **关系边** — 同簇文档两两建 semantic edge，weight 按相关度 0.5-1.0。写入 `edges.json`。
4. **结构洞察** — 计算枢纽（入度≥2）、孤岛（无边）、桥梁（跨簇边）、过期（>30天未更新且被引用）。写入 `structural_insights.json`。
5. **聚类深度分析** — 每个聚类的共同主题、矛盾观点、重复内容。写入 `semantic_insights.json`。
6. **碰撞洞察** — 挑 3-5 对跨簇、无直连、但有潜在交叉的文档对，生成行动建议 + reasoning。写入 `collision_insights.json`。

每步完成后告知用户进度。碰撞洞察是核心价值——要具体到可执行的行动，不要泛泛而谈。

### Step 3 — Render

```bash
npx knowledge-explorer --render-only
```

输出终端彩色报告 + 自动创建飞书文档。把飞书文档链接返回给用户。

## Path B: API Pipeline

```bash
cd ~/Desktop/knowledge-explorer
npx knowledge-explorer                          # 全量扫描 + AI 分析 + 输出
npx knowledge-explorer --query "产品规划"        # 关键词搜索
```

需要环境变量（项目根目录 `.env` 会自动加载）：
- `OPENAI_API_KEY` — API key
- `OPENAI_BASE_URL` — 默认 OpenAI，通义千问用 `https://dashscope.aliyuncs.com/compatible-mode/v1`
- `AI_MODEL` — 默认 `gpt-4o-mini`

也支持分阶段执行：`--collect-only` → `--analyze-only` → `--render-only`。

## Troubleshooting

| 症状 | 原因 | 修复 |
|------|------|------|
| `未找到任何文档` | lark-cli 未登录或无权限 | `lark-cli auth login --scope search:docs_wiki:readonly,wiki:node:read,docx:document:readonly,docx:document` |
| `AI not configured` | 缺 API key（Path B） | 检查 `.env` 或改用 Path A |
| `429 Too Many Requests` | API 限流 | 等几分钟重试，或换 key |
| 聚类结果太少（≤2组） | 文档数太少或主题太集中 | 扩大搜索范围（去掉 --query 限制） |
| 飞书文档创建失败 | 缺 `docx:document` scope | `lark-cli auth login --scope docx:document` |

## Output

- **终端** — 知识健康度 → 主题聚类（含文档列表） → 碰撞洞察（含 reasoning） → 健康建议
- **飞书文档** — 自动创建，含概览 callout、分割线分章、碰撞分析 callout
