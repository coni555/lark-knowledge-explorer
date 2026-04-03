# Knowledge Explorer — 设计规格

> 飞书 CLI 创作者大赛参赛项目 | GitHub 开发赛道
> 评审维度：原创性、实用性、创新性、技术可行性
> Stars 统计期：2026-04-20 至 04-25

## 1. 产品定义

**名称**：knowledge-explorer（飞书知识探索器）

**定位**：扫描飞书知识库，自动发现文档间的隐藏关系，并从中生成可行动的洞察。

**目标用户**：个人知识工作者优先，架构预留团队扩展。

**核心差异化**：不止展示关系图谱，更要从关系中产生新东西——碰撞分析、创意激发、行动建议。

### 与现有方案对比

| 能力 | 飞书原生 | 现有开源 | knowledge-explorer |
|------|---------|---------|-------------------|
| 文档关系 | 手动双向链接 | 无 | 自动发现，语义级 |
| 跨源聚合 | 无 | 无 | wiki + doc + sheets + 会议纪要 |
| 知识健康度 | 无 | 无 | 孤立文档、过期内容、重复主题 |
| 洞察生成 | AI 问答 | 向量检索 | 碰撞分析 + 创意激发 |

## 2. 交互设计

**单一入口**：`knowledge explore`，内部自动编排全流程。不做子命令拆分。

**触发方式**：灵活指定扫描范围——空间、文档列表、关键词均可。

**输出**：终端即时摘要 + 自动创建飞书文档沉淀（默认行为，无需 `--save`）。

## 3. 核心流程

四阶段顺序执行：

```
Phase 1: Collect（收集）
  ↓ docs +search 全局搜索 → wiki get_node 解析类型
  ↓ docs +fetch / sheets +read / vc +notes 按类型抓内容
Phase 2: Build Graph（建图）
  ↓ 解析文档内链 → link edges
  ↓ 标题/关键词交叉匹配 → mention edges
  ↓ AI 摘要生成 + 语义比较 → semantic edges
  ↓ 基于 edges 做聚类 → clusters
Phase 3: Insights（洞察）
  ↓ L1 结构洞察：图算法（hub/孤岛/桥梁/过期）
  ↓ L2 语义洞察：AI per cluster（主题/矛盾/重复）
  ↓ L3 碰撞洞察：AI per pair（跨 cluster 创意生成）
Phase 4: Output（输出）
  ↓ 终端彩色摘要
  ↓ 创建飞书文档（完整报告）
```

## 4. 数据模型

### 缓存目录

```
.knowledge-cache/
├── nodes.json        # 文档节点
├── edges.json        # 关系边
├── summaries.json    # AI 摘要（最贵，必须缓存）
├── clusters.json     # 聚类结果
└── meta.json         # 元信息（时间戳、版本、扫描范围）
```

### Node 结构

```jsonc
{
  "id": "wiki_7xxx",                // wiki node token 或 doc token
  "type": "wiki|doc|sheet|meeting", // 来源类型
  "title": "Q1 产品规划",
  "space": "产品团队",
  "url": "https://xxx.feishu.cn/wiki/...",
  "updated_at": "2026-03-15T10:00:00Z",
  "summary": "本文档定义了Q1三个核心目标...", // AI 生成，~100字
  "keywords": ["产品规划", "OKR", "Q1"],    // AI 提取
  "word_count": 2300,
  "fetched_at": "2026-04-03T..."
}
```

### Edge 结构

```jsonc
{
  "source": "wiki_7xxx",
  "target": "wiki_8yyy",
  "type": "link|mention|semantic",
  "weight": 0.85,
  "reason": "两篇都讨论了用户留存策略，但从不同角度" // 仅 semantic 类型
}
```

### 关键决策

- **摘要粒度**：文档级。竞赛周期优先出效果，后续可按需升级到章节级。
- **缓存策略**：`fetched_at` vs `updated_at` 比对，未变文档跳过，避免重复 AI 调用。
- **三种边分层**：link（确定性，解析内容）→ mention（半确定，关键词匹配）→ semantic（AI 判断，成本最高价值最大）。
- **存储**：纯 JSON 文件，不引入数据库。几百篇文档规模足够。
- **增量更新**：meta.json 记录上次扫描范围和时间。

## 5. AI 洞察策略

> 先出效果再调优，以用户反馈驱动迭代。

### 三层递进

| 层级 | 方法 | AI 调用 | 输出 |
|------|------|---------|------|
| **L1 结构洞察** | 图算法 | 无 | hub 节点、孤岛、桥梁、可能过期 |
| **L2 语义洞察** | AI per cluster | ~8 次 | 共同主题、矛盾观点、重复内容 |
| **L3 碰撞洞察** | AI per pair | ~5 次 | 跨 cluster 创意和行动建议 |

### L1 规则（无 AI）

- 入度 top-N → hub 文档
- 出度 = 0 → 孤岛文档
- 跨 cluster 边 → 桥梁文档
- 高引用 + 30天未更新 → 可能过期

### L2 prompt 策略

输入一个 cluster 内所有文档摘要，要求输出：
- cluster 主题标签
- 共同讨论的主题
- 矛盾或分歧观点
- 重复内容提示

### L3 筛选与生成

筛选条件：不同 cluster + 无直接 edge + keyword 有交集。最多取 top-5 对。

Prompt：「文档A讲了X，文档B讲了Y，它们从未被关联。把两者结合，能产生什么新想法或行动建议？」

### 成本估算（100 篇文档）

| 阶段 | 次数 |
|------|------|
| 摘要生成 | ~100 |
| L2 cluster | ~8 |
| L3 碰撞 | ~5 |
| **总计** | **~113** |

## 6. 输出格式

### 终端

```
🔍 扫描完成：47 篇文档，3 个空间

📊 知识健康度
  ├ 枢纽文档 (3)：Q1规划、技术架构、用户画像
  ├ 孤岛文档 (5)：会议纪要-0312、...
  └ 可能过期 (2)：竞品分析(89天未更新，被7篇引用)

🔗 发现 4 个主题聚类
  ├ #用户增长 (12篇)  ├ #技术债务 (8篇)
  ├ #竞品情报 (6篇)   └ #团队协作 (5篇)

💡 碰撞洞察 (Top 3)
  1.《竞品定价》×《用户访谈》→ 可设计阶梯定价方案
  2.《技术债务清单》×《Q2招聘计划》→ 按债务优先级排招聘需求
  3.《用户流失分析》×《功能路线图》→ 流失Top原因未在路线图中

📄 完整报告已生成 → 飞书文档链接
```

### 飞书文档

自动创建，结构：
1. **概览** — 扫描范围、文档数、时间
2. **知识图谱摘要** — 枢纽/孤岛/桥梁列表（带文档链接）
3. **主题聚类** — 每个 cluster 的主题、包含文档、AI 分析
4. **碰撞洞察** — 每对碰撞的详细分析和行动建议
5. **健康度建议** — 建议合并的重复文档、建议更新的过期文档

## 7. 技术架构

- **语言**：TypeScript
- **依赖**：飞书 Open API（HTTP 直调）、AI 接口（飞书 AI 优先 / OpenAI 兼容备选）、图算法手写、chalk 终端美化
- **存储**：纯 JSON 文件，无数据库

### 目录结构

```
knowledge-explorer/
├── src/
│   ├── index.ts        # Skill 入口，explore 命令
│   ├── collect.ts      # Phase 1: 抓取文档
│   ├── graph.ts        # Phase 2: 建图 + 图算法
│   ├── insights.ts     # Phase 3: AI 洞察生成
│   ├── output.ts       # Phase 4: 终端 + 飞书文档输出
│   ├── cache.ts        # .knowledge-cache 读写
│   └── types.ts        # Node, Edge, Cluster 类型定义
├── .knowledge-cache/   # 运行时生成，gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## 8. API 权限

### 搜索 API 跨空间能力

`docs +search` 底层调用 `POST /open-apis/search/v2/doc_wiki/search`，按用户身份搜索所有可访问文档，天然跨空间，无 space_id 限制。

`wiki spaces` 当前仅封装 `get_node`，无 list 能力。空间结构遍历需裸调原生 endpoint，作为后续增强。

### 权限清单

| 阶段 | 操作 | 命令 | scope |
|------|------|------|-------|
| 收集 | 搜索全局文档 | `docs +search` | `search:docs_wiki:readonly` |
| 收集 | 解析 wiki 节点 | `wiki spaces get_node` | `wiki:node:read` |
| 收集 | 读取文档内容 | `docs +fetch` | `docx:document:readonly` |
| 收集 | 读取表格内容 | `sheets +read` | `sheets:spreadsheet:readonly` |
| 收集 | 获取会议纪要 | `vc +notes` | `vc:meeting:readonly` |
| 输出 | 创建报告文档 | `docs +create` | `docx:document` |

共 6 个 scope，5 读 1 写。

## 9. 演示策略

### README

1. 30秒 GIF — 一行命令全流程
2. 为什么需要 — 知识库越大越乱、飞书无图谱、团队重复造轮子
3. 快速开始 — 安装 → 授权 → explore
4. 能发现什么 — 截图展示四类输出
5. 工作原理 — 四阶段流程图
6. 中英双语

### GIF 录制

真实飞书知识库，30 秒内，重点：命令简洁 → 进度条 → 彩色输出 → 飞书链接。工具：asciinema 或 VHS。

### Stars 拉动

- 投放：Hacker News / V2EX / 即刻 / Twitter
- 夜识AI 公众号实战教程（兼社媒赛道）

## 10. 范围与约束

### MVP 包含

- `knowledge explore` 单命令全流程
- wiki + doc 类型支持（sheets 和会议纪要作为快速跟进）
- L1 + L2 洞察（L3 碰撞如时间允许）
- 终端输出 + 飞书文档沉淀
- 增量缓存

### MVP 不包含

- 图形化可视化（终端足够，图形化是锦上添花）
- 团队协作功能
- 空间结构遍历（用搜索 API 替代）
- 实时监控 / webhook 触发
- 多语言 i18n（README 双语即可，UI 中文优先）

### 风险

| 风险 | 缓解 |
|------|------|
| AI 调用成本高 | 缓存 + 增量更新 + L3 控制在 top-5 |
| 飞书 API 限流 | 收集阶段加 rate limiter，失败重试 |
| 搜索 API 返回不全 | 分页遍历，后续可补空间结构遍历 |
| 竞赛周期短 | MVP 先出核心流程，演示优先 |
