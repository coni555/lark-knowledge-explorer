<div align="center">

[English](README.md) | [中文](README.zh.md)

# Knowledge Explorer

### 飞书知识探索器

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)
[![lark-cli](https://img.shields.io/badge/lark--cli-required-blue.svg)](https://github.com/larksuite/cli)

扫描飞书知识库，自动发现文档间的隐藏关系，<br>
生成可行动的碰撞洞察 — 一条命令搞定。

[快速开始](#-快速开始) · [核心能力](#-核心发现) · [两种模式](#-两种分析模式) · [工作原理](#-工作原理) · [作为 Skill 使用](#-作为-ai-agent-skill) · [参与贡献](#-参与贡献)

</div>

---

<!-- TODO: 替换为实际 GIF 录屏 -->
<!-- <p align="center"><img src="docs/demo.gif" width="700" alt="Knowledge Explorer 演示"></p> -->

## 为什么需要这个工具？

飞书知识库每天都在增长，但文档之间的关联只存在于你的脑子里。

- **没有图谱视图** — 飞书不像 Obsidian 有知识图谱
- **隐性重复** — 不同团队在不同空间写了类似的内容，彼此不知情
- **遗漏的连接** — 两篇看似无关的文档碰在一起可能产生全新想法
- **知识老化** — 重要文档被频繁引用，却长期未更新

Knowledge Explorer 用 AI **从零建立连接** — 而不只是发现已有链接。

## ✨ 核心发现

| | 类型 | 示例 |
|---|---|---|
| 🏛 | **枢纽文档** | *《Q1 规划》被 4 篇引用、与 8 篇语义关联 — 你的知识锚点* |
| 🏝 | **孤岛文档** | *5 篇文档与其他文档零关联 — 考虑归档或建立链接* |
| 🌉 | **桥梁文档** | *《用户调研》连接了产品组和市场组两个主题群* |
| ⏰ | **过期文档** | *《竞品分析》89 天未更新，仍被 3 篇引用* |
| 🔗 | **主题聚类** | *AI 自动将文档分组为 #用户增长、#技术债务、#竞品情报 等主题* |
| 💡 | **碰撞洞察** | *《竞品定价》×《用户访谈》→ 可设计阶梯定价方案* |

**碰撞洞察**是核心差异化功能 — 找到来自不同主题群的文档，发现它们之间隐藏的交叉点，并生成可行动的组合建议。

## 🚀 快速开始

### 前置条件

- [lark-cli](https://github.com/larksuite/cli) 已安装并登录
- Node.js >= 20

### 安装

```bash
git clone https://github.com/coni555/lark-knowledge-explorer.git
cd knowledge-explorer
npm install && npm run build
```

### 运行

```bash
# 方式 A：让 Claude 直接分析（零 API 配置）
npx knowledge-explorer --collect-only
# → 然后让 Claude 读取 .knowledge-cache/ 进行分析

# 方式 B：全自动 API 模式
echo "OPENAI_API_KEY=sk-xxx" > .env
echo "OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1" >> .env
npx knowledge-explorer
```

搞定。终端彩色报告 + 飞书文档自动生成。

## 🔀 两种分析模式

| | Claude 直接分析 (Path A) | API 管线 (Path B) |
|---|---|---|
| **配置** | 零配置 | 需要 `OPENAI_API_KEY` |
| **方式** | `--collect-only` → Claude 分析缓存 → `--render-only` | 一条命令全自动 |
| **适合** | Claude Code / Codex 用户 | 批量运行、CI/CD |
| **成本** | Claude 订阅费 | API token 费用 |

### Path A：Claude 直接分析

```bash
npx knowledge-explorer --collect-only          # 第 1 步：收集文档
# Claude 读取 .knowledge-cache/nodes.json     # 第 2 步：AI 分析
npx knowledge-explorer --render-only           # 第 3 步：渲染报告
```

### Path B：API 管线

```bash
npx knowledge-explorer                         # 全量扫描 + AI 分析 + 输出
npx knowledge-explorer --query "产品规划"       # 关键词搜索
npx knowledge-explorer --owner me              # 只看我的文档
```

<details>
<summary><b>全部 CLI 参数</b></summary>

| 参数 | 说明 |
|------|------|
| `--collect-only` | 仅收集文档到缓存（不需要 AI） |
| `--analyze-only` | 仅分析缓存文档（需要 API key） |
| `--render-only` | 仅从缓存读取结果并输出报告 |
| `--query <关键词>` | 关键词搜索模式（替代全量扫描） |
| `--owner me\|others\|<名字>` | 按文档所有者过滤 |
| `--space <space_id>` | 限定某个知识空间 |
| `--max-pages <n>` | 搜索最大页数（默认 10） |
| `--list-spaces` | 列出所有可访问的知识空间 |

**环境变量**（从 `.env` 自动加载）：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OPENAI_API_KEY` | OpenAI 兼容 API key | — |
| `OPENAI_BASE_URL` | 自定义 API 端点 | `https://api.openai.com/v1` |
| `AI_MODEL` | 模型名称 | `gpt-4o-mini` |

</details>

## 📊 输出示例

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

## ⚙️ 工作原理

```
                    ┌─────────────────────────────────┐
                    │  阶段 1：收集                     │
                    │  遍历知识空间 + 全局搜索            │
                    │  通过 lark-cli                    │
                    └──────────────┬──────────────────┘
                                   ↓
                    ┌─────────────────────────────────┐
                    │  阶段 2：建图                     │
                    │  AI 摘要 → 语义聚类               │
                    │  → 自动生成关系边                  │
                    └──────────────┬──────────────────┘
                                   ↓
                    ┌─────────────────────────────────┐
                    │  阶段 3：生成洞察                  │
                    │  L1 结构洞察 → L2 语义洞察         │
                    │  → L3 碰撞洞察                    │
                    └──────────────┬──────────────────┘
                                   ↓
                    ┌─────────────────────────────────┐
                    │  阶段 4：输出                     │
                    │  终端报告 + 飞书文档               │
                    │  （自动创建）                      │
                    └─────────────────────────────────┘
```

**语义优先架构**：不是去找文档间已有的链接，而是用 AI 理解内容、从零建立连接 — 因为大多数个人知识库几乎没有显式的交叉引用。

## 🛠 技术栈

- **TypeScript** — CLI 核心
- **[lark-cli](https://github.com/larksuite/cli)** — 飞书 API 层
- **OpenAI 兼容 API** — AI 分析（通义千问、DeepSeek、GPT 等）
- **纯 JSON 缓存** — 无数据库依赖

## 🤖 作为 AI Agent Skill

Knowledge Explorer 自带 `SKILL.md`，支持 [Claude Code](https://claude.ai/claude-code) 和 Codex。安装后可以用 AI 对话式探索飞书知识库：

```bash
# Claude Code
cp -r knowledge-explorer ~/.claude/skills/knowledge-explorer

# Codex
cp -r knowledge-explorer ~/.codex/skills/knowledge-explorer
```

Skill 支持两种模式 — Claude 可以运行完整管线，也可以直接分析缓存文档。

## 🤝 参与贡献

欢迎贡献！如果你发现了 bug 或有功能建议：

1. [提交 Issue](https://github.com/coni555/lark-knowledge-explorer/issues)
2. Fork → 新建分支 → 提交 PR

大的改动建议先开 Issue 讨论。

## 📈 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=coni555/lark-knowledge-explorer&type=Date)](https://star-history.com/#coni555/lark-knowledge-explorer&Date)

## 许可证

[MIT](LICENSE)

---

<div align="center">

**为 [lark-cli 创作者大赛](https://waytoagi.feishu.cn/wiki/R4S3w8wTTie04nkYiL6c8rxon4d)而建** · 觉得有用请点个 star ⭐

</div>
