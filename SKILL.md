---
name: knowledge-explorer
version: 0.3.0
description: "飞书知识探索器：扫描飞书知识库，AI语义聚类自动发现文档间隐藏关系，生成碰撞洞察和行动建议。支持 Claude 直接分析（零配置）或外部 API 模式。当用户需要分析知识库结构、发现文档关联、检查知识健康度（孤岛/过期/重复）、或想从已有文档中碰撞出新想法时使用。If user mentions 知识图谱、文档关系、知识库分析、explore my docs, use this skill."
metadata:
  requires:
    bins: ["lark-cli", "node"]
---

# Knowledge Explorer — 飞书知识探索器

> **前置条件：** lark-cli 已登录（`lark-cli auth login`）、Node.js >= 18

## 两种分析模式

### Path A：Claude 直接分析（推荐，零配置）

不需要任何 API key，由 Claude 直接完成 AI 分析。

**Step 1 — 收集文档**

```bash
cd ~/Desktop/knowledge-explorer

# 全量扫描
npx knowledge-explorer --collect-only

# 或关键词搜索
npx knowledge-explorer --collect-only --query "产品规划"

# 可选过滤
npx knowledge-explorer --collect-only --owner me
npx knowledge-explorer --collect-only --space <space_id>
```

**Step 2 — Claude 分析**

收集完成后，读取 `.knowledge-cache/nodes.json`，对每篇文档：

1. **生成摘要和关键词**：读取文档 content，生成 summary（100字内）和 keywords（5-8个），写入 `summaries.json`
2. **语义聚类**：根据所有摘要和关键词，按主题分组（4-8组），写入 `clusters.json`
3. **建立关系边**：簇内文档建 semantic 边，写入 `edges.json`
4. **结构分析**：计算枢纽/孤岛/桥梁/过期文档，写入 `structural_insights.json`
5. **聚类深度分析**：每个聚类的共同主题、矛盾、重复，写入 `semantic_insights.json`
6. **碰撞洞察**：跨簇文档的创意组合，写入 `collision_insights.json`

**Step 3 — 渲染输出**

```bash
npx knowledge-explorer --render-only
```

### Path B：全自动 API 模式

需要 OpenAI 兼容 API key（通义千问、DeepSeek 等）。

```bash
export OPENAI_API_KEY=sk-xxx
export OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
npx knowledge-explorer
```

## CLI 参数

| 参数 | 说明 |
|------|------|
| (无参数) | 全量扫描 + API 分析 + 输出 |
| `--collect-only` | 仅收集文档到缓存 |
| `--analyze-only` | 仅分析缓存中的文档（需 API key） |
| `--render-only` | 仅从缓存读取结果并输出 |
| `--query <keyword>` | 关键词搜索模式 |
| `--owner me\|others\|<name>` | 按文档所有者过滤 |
| `--space <space_id>` | 限定某个空间 |
| `--max-pages <n>` | 搜索最大页数 |
| `--list-spaces` | 列出所有可访问空间 |

## Cache 文件 Schema（Claude 分析时写入）

所有文件位于 `.knowledge-cache/` 目录。

### summaries.json

```json
[
  {
    "id": "doc_token",
    "summary": "一句话中文摘要",
    "keywords": ["主题词", "领域词", "实体词"],
    "updated_at": "2026-04-05T10:00:00Z"
  }
]
```

### clusters.json

```json
[
  {
    "id": "cluster_0",
    "label": "主题标签（2-6字）",
    "node_ids": ["doc_id_1", "doc_id_2"],
    "summary": "该聚类的一句话描述"
  }
]
```

### edges.json

```json
[
  {
    "source": "doc_id_1",
    "target": "doc_id_2",
    "type": "semantic",
    "weight": 0.8,
    "reason": "聚类主题标签"
  }
]
```

### structural_insights.json

```json
[
  {
    "type": "hub|orphan|bridge|stale",
    "node_ids": ["doc_id_1"],
    "description": "中文描述"
  }
]
```

### semantic_insights.json

```json
[
  {
    "cluster_id": "cluster_0",
    "themes": ["共同话题1"],
    "contradictions": ["矛盾观点"],
    "duplicates": ["可能重复的内容"],
    "summary": "聚类分析摘要"
  }
]
```

### collision_insights.json

```json
[
  {
    "node_a_id": "doc_id_1",
    "node_b_id": "doc_id_2",
    "suggestion": "一句话行动建议",
    "reasoning": "为什么这两篇可以结合"
  }
]
```

## 输出内容

- **终端**：彩色报告（知识健康度 + 主题聚类 + 碰撞洞察）
- **飞书文档**：自动创建完整分析报告

## 权限

| 操作 | scope |
|------|-------|
| 搜索文档 | `search:docs_wiki:readonly` |
| 读取 wiki 节点 | `wiki:node:read` |
| 读取文档内容 | `docx:document:readonly` |
| 创建报告文档 | `docx:document` |
