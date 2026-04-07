<div align="center">

[English](README.md) | [中文](README.zh.md)

# Knowledge Explorer

### 飞书知识探索器

[![npm version](https://img.shields.io/npm/v/lark-knowledge-explorer.svg)](https://www.npmjs.com/package/lark-knowledge-explorer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)
[![lark-cli](https://img.shields.io/badge/lark--cli-required-blue.svg)](https://github.com/larksuite/cli)

你的飞书文档是散落的笔记，彼此没有关联。<br>
这个工具用 AI 从零建立连接，找到你从未想到的文档交叉点。

[我能做什么](#-我能做什么) · [安装](#-安装) · [核心发现](#-它会发现什么) · [输出示例](#-输出示例) · [工作原理](#-工作原理)

</div>

---

<p align="center"><img src="docs/demo.gif" width="700" alt="Knowledge Explorer 演示"></p>

## 为什么需要？

飞书知识库每天都在增长，但文档之间的关联只存在于你的脑子里。

- **没有知识图谱** — 飞书不像 Obsidian，没有全局的关系视图
- **隐性重复** — 不同空间写了类似内容，彼此不知情
- **遗漏的连接** — 两篇看似无关的文档碰在一起，可能产生全新想法
- **知识老化** — 重要文档被频繁引用，却长期未更新

Knowledge Explorer 用 AI **从零建立连接** — 不只是发现已有链接，而是理解内容后创造新关系。

---

## 🎯 我能做什么

安装 Skill 后，你只需要用自然语言告诉 AI 你想做什么。

### 扫描与分析

| 你说 | AI 做什么 |
|------|-----------|
| "帮我分析一下知识库" | 扫描所有知识空间的全部文档，生成完整报告 |
| "分析一下产品相关的文档" | 按关键词"产品"搜索文档并分析 |
| "只看我自己写的文档" | 筛选你名下的文档进行分析 |
| "只看别人写的文档" | 排除你的文档，只分析他人的 |
| "只分析 XX 空间" | 限定在某个知识空间内扫描 |
| "只看 XX 空间下的 YY 文件夹" | 精确到某个文件夹及其子文件夹 |
| "扫描我的云盘" | 扫描飞书云盘文件（而非知识空间） |
| "分析云盘里的 XX 文件夹" | 扫描云盘指定文件夹及其子文件夹 |

以上条件**可以自由组合**，比如："帮我分析产品空间里我自己写的文档"。

### 辅助查询

| 你说 | AI 做什么 |
|------|-----------|
| "我有哪些知识空间？" | 列出所有可访问的空间名称和 ID |
| "看看 XX 空间的文件夹结构" | 树形展示空间内的文件夹层级，方便你指定范围 |
| "看看我的云盘文件结构" | 树形展示云盘文件夹层级，方便你指定范围 |

### 支持的文档类型

| 类型 | 状态 |
|------|------|
| 新版文档 (docx) | 完整扫描+分析 |
| 旧版文档 (doc) | 完整扫描+分析 |
| 电子表格 / 多维表格 / 幻灯片 / 思维导图 | 跳过（无正文文本） |

---

## ✨ 它会发现什么

每次分析完成后，你会收到一份**飞书云文档报告**，包含以下发现：

| | 发现 | 说明 |
|---|---|---|
| 🏛 | **枢纽文档** | 被大量引用的知识锚点，例如《Q1 规划》被 4 篇引用、与 8 篇语义关联 |
| 🏝 | **孤岛文档** | 与其他文档零关联，可能需要归档或建立链接 |
| 🌉 | **桥梁文档** | 横跨多个主题的连接器，例如《用户调研》同时关联产品组和市场组 |
| ⏰ | **过期文档** | 长期未更新但仍被频繁引用，提醒你及时维护 |
| 🔗 | **主题聚类** | AI 自动将文档按主题分组，如 #用户增长、#技术债务、#竞品情报 |
| 💡 | **碰撞洞察** | 从不同主题群中找到隐藏交叉点，生成具体可行动的组合建议 |

**碰撞洞察**是核心差异化功能 — 它不是在告诉你"这两篇文档相似"，而是在说"把这两篇放在一起看，你可以做出 XX"。

### 报告还包含

- **知识健康建议** — 哪些文档该合并、该更新、该关联
- **行动清单** — 可勾选的待办事项，直接在飞书文档里跟进

---

## 🚀 安装

### 作为 AI Agent Skill（推荐）

适用于 Claude Code、Codex 等 Coding Agent 用户。安装后用对话即可触发分析，**零 API 配置**。

把下面这段话发给你的 AI Agent，它会自动完成全部安装：

> 帮我安装飞书知识探索器（Knowledge Explorer）。按顺序执行：
>
> 1. 检查 Node.js >= 20，没有就提示我手动安装
> 2. `npm install -g @larksuite/cli`
> 3. `npm install -g lark-knowledge-explorer`
> 4. 运行 `lark-cli auth login --scope search:docs_wiki:readonly,wiki:node:read,docx:document:readonly,docx:document,drive:drive:readonly` —— 这一步需要我在浏览器里授权，等我完成再继续
> 5. 把 npm 全局包里的 Skill 文件安装到你的 skills 目录：源路径 `$(npm root -g)/lark-knowledge-explorer/`（需要 SKILL.md 和 references/ 两个）
>
> 装完后告诉我可以说什么来触发知识库分析。

装完之后，直接对 AI 说"帮我分析一下知识库"就行了。

### 作为独立 CLI 工具

如果你不用 AI Agent，也可以直接跑命令行。需要配置 AI API：

```bash
# 安装
npm install -g lark-knowledge-explorer

# 配置 AI（支持 OpenAI、通义千问、DeepSeek 等兼容接口）
echo "OPENAI_API_KEY=sk-xxx" > .env
echo "OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1" >> .env

# 运行
npx knowledge-explorer
```

<details>
<summary><b>全部 CLI 参数</b></summary>

| 参数 | 说明 |
|------|------|
| `--collect-only` | 仅收集文档到缓存（不需要 AI） |
| `--analyze-only` | 仅分析缓存文档（需要 API key） |
| `--render-only` | 仅从缓存读取结果并输出报告 |
| `--analyze-prompt` | 生成分析 prompt，可复制给任意 AI 使用 |
| `--query <关键词>` | 关键词搜索模式（替代全量扫描） |
| `--owner me\|others\|<名字>` | 按文档所有者过滤 |
| `--space <space_id>` | 限定某个知识空间 |
| `--folder <node_token>` | 限定某个文件夹子树（需配合 `--space`） |
| `--max-pages <n>` | 搜索最大页数（默认 10） |
| `--list-spaces` | 列出所有可访问的知识空间 |
| `--list-tree <space_id>` | 树形展示空间的文件夹结构 |
| `--drive [folder_token]` | 扫描飞书云盘文件夹（默认根目录） |
| `--list-drive [folder_token]` | 树形展示云盘文件夹结构 |
| `--minutes` | 同时收集会议纪要（可与任何模式组合） |
| `--minutes-days <n>` | 搜索会议的时间范围，天数（默认 30） |

**环境变量**（从 `.env` 自动加载）：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OPENAI_API_KEY` | OpenAI 兼容 API key | — |
| `OPENAI_BASE_URL` | 自定义 API 端点 | `https://api.openai.com/v1` |
| `AI_MODEL` | 模型名称 | `gpt-4o-mini` |

</details>

---

## 📊 输出示例

```
🔍 扫描完成：36 篇文档（云盘文件夹 + 搜索补充）

📊 知识健康度
  🏛 枢纽文档 (8)：阅读工坊策划案、社群运营指南 等
  🌉 桥梁文档 (6)：核心技能课程体系、学员成长路径图 等
  ⏰ 可能过期 (7)：暑期系列分享 #1-7（超过 3 个月未更新）

🔗 发现 5 个主题聚类
  ├ #阅读工坊 (8篇)
  │   · 阅读工坊策划案
  │   · 核心思维课程整理
  │   · 学员阅读痛点合集
  │   · ...
  ├ #社群运营 (7篇)
  │   · 社群 SOP 执行记录
  │   · 圈子运营方案
  │   · 入群引导流程
  │   · ...
  ├ #暑期充电站 (7篇)
  │   · 充电站｜表达力篇
  │   · 充电站｜信息管理篇
  │   · ...
  ├ #活动策划 (5篇)
  │   · 破冰活动指南
  │   · 同辈分享会策划案
  │   · ...
  └ #会议纪要 (4篇)
      · 近期会议速递 7.23
      · 近期会议速递 7.30

💡 碰撞洞察 (Top 5)
  1.《学员阅读痛点合集》×《核心思维课程整理》
     → 围绕 Top 3 痛点重构 6 周课程大纲
     文档A显示学员最大的卡点是"提取论证"——但课程把这个放在第 5 周，
     提前到第 1 周可能直接砍掉一半的早期流失...
  2.《社群 SOP 执行记录》×《破冰活动指南》
     → 把破冰环节嵌入社群入群 SOP 的 Day-1
     SOP 记录显示 40% 的新成员入群后沉默，而破冰活动的参与率达 90%...

📄 完整报告已生成 → https://feishu.cn/docx/xxx
```

除了终端输出，还会**自动在飞书创建一份完整报告文档**，包含可点击的文档链接和可勾选的行动清单。

---

## ⚙️ 工作原理

```
  收集文档          建立图谱          生成洞察          输出报告
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ 遍历空间  │──→│ AI 摘要  │──→│ 枢纽/孤岛│──→│ 终端报告 │
│ 全局搜索  │   │ 语义聚类 │   │ 桥梁/过期│   │ 飞书文档 │
│ 抓取正文  │   │ 自动连边 │   │ 碰撞洞察 │   │ 行动清单 │
└──────────┘   └──────────┘   └──────────┘   └──────────┘
```

**语义优先**：不是去找文档间已有的链接，而是用 AI 理解内容后从零建立连接 — 因为大多数个人知识库几乎没有显式的交叉引用。

### 技术栈

- **TypeScript** — CLI 核心
- **[lark-cli](https://github.com/larksuite/cli)** — 飞书 API 层
- **OpenAI 兼容 API** — AI 分析（通义千问、DeepSeek、GPT 等）
- **纯 JSON 缓存** — 无数据库依赖

---

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

感谢 [lark-cli](https://github.com/larksuite/cli) 让飞书 API 在终端触手可及。<br>
也感谢每一位点亮 star 的你，你的关注是我持续迭代的动力。

</div>
