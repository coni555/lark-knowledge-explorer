# Knowledge Explorer 设计文档

> 飞书 CLI 创作者大赛参赛项目
> 状态：MVP 完成，集成测试通过
> 最后更新：2026-04-03
> GitHub：https://github.com/coni555/knowledge-explorer

## 产品定义

**名称**：knowledge-explorer（飞书知识探索器）

**一句话定位**：扫描飞书知识库，自动发现文档间的隐藏关系，并从中生成可行动的洞察。

**核心用户故事**：
> "我的飞书知识库里有几十上百篇文档，但我从来不知道它们之间有什么关联。我希望有个工具能帮我看到全貌，找到我忽略的连接，甚至告诉我哪些文档放在一起能碰撞出新想法。"

### 与现有工具的差异

| | 飞书原生 | 现有开源 | knowledge-explorer |
|---|---|---|---|
| 文档关系 | 手动双向链接，文档级 | 无 | 自动发现，语义级 |
| 跨源聚合 | 无 | 无 | wiki + doc + sheets + 会议纪要 |
| 知识健康度 | 无 | 无 | 孤立文档、过期内容、重复主题 |
| 洞察生成 | AI问答（半成品） | 向量检索 | 碰撞分析 + 创意激发 + MOC生成 |

### 竞赛信息

- **赛道**：GitHub 开发赛道
- **评审维度**：原创性、实用性、创新性、技术可行性
- **关键时间**：4月20-25日统计 Stars
- **报名入口**：https://waytoagi.feishu.cn/wiki/R4S3w8wTTie04nkYiL6c8rxon4d

---

## 设计决策记录

### 已确认

1. **两条能力都做**：知识图谱/关系发现 + 跨源知识聚合
2. **核心差异化**：不止看到关系，要从关系中产生新东西（碰撞、创意、行动建议）
3. **用户定位**：个人知识工作者优先，架构预留团队扩展
4. **输出形态**：终端探索 + 飞书文档沉淀
5. **触发方式**：灵活指定（空间/文档/关键词）
6. **交互模式**：单一入口 `explore`，内部自动编排全流程，不做子命令爆炸

### 待设计

- [x] 核心流程详细设计
- [x] 数据模型（索引结构）
- [x] AI 洞察生成策略
- [x] 输出格式设计
- [x] 技术架构
- [x] API 权限清单
- [x] 演示策略（README + GIF）

---

## 数据模型

### 缓存结构

```
.knowledge-cache/
├── nodes.json          # 所有文档节点
├── edges.json          # 文档间关系（链接、引用、语义相似）
├── summaries.json      # AI 生成的文档摘要（最贵的部分，必须缓存）
├── clusters.json       # 聚类结果
└── meta.json           # 缓存元信息（时间戳、版本、扫描范围）
```

### 节点（Node）

```jsonc
{
  "id": "wiki_7xxx",              // wiki node token 或 doc token
  "type": "wiki|doc|sheet|meeting", // 来源类型
  "title": "Q1 产品规划",
  "space": "产品团队",             // 所属空间
  "url": "https://xxx.feishu.cn/wiki/...",
  "updated_at": "2026-03-15T10:00:00Z",
  "summary": "本文档定义了Q1三个核心目标...",  // AI 生成，~100字
  "keywords": ["产品规划", "OKR", "Q1"],      // AI 提取
  "word_count": 2300,
  "fetched_at": "2026-04-03T..."   // 上次抓取时间
}
```

### 边（Edge）

```jsonc
{
  "source": "wiki_7xxx",
  "target": "wiki_8yyy",
  "type": "link|mention|semantic",  // 显式链接 | 文本提及 | AI判断的语义关联
  "weight": 0.85,                   // 关系强度（语义相似度 or 引用频次归一化）
  "reason": "两篇都讨论了用户留存策略，但从不同角度" // 仅 semantic 类型有
}
```

### 设计决策

- **摘要粒度**：文档级（一篇一个摘要）。竞赛周期优先出效果，后续可升级到长文档拆章节。
- **摘要缓存策略**：按 `fetched_at` vs `updated_at` 判断是否需刷新，未变文档跳过。
- **三种边分层**：link（确定性，解析文档内容）、mention（半确定，标题/关键词匹配）、semantic（AI 判断，成本最高价值最大）。
- **存储方式**：纯 JSON 文件，不引入数据库依赖。几百篇文档规模足够。
- **增量更新**：meta.json 记录上次扫描范围和时间，再次 explore 只处理新增/修改文档。

---

## AI 洞察生成策略

> 核心原则：先出效果再调优，以用户反馈驱动迭代。

### 三层递进

| 层级 | 类型 | 方法 | 示例输出 |
|------|------|------|----------|
| L1 结构洞察 | 纯图算法 | hub节点、孤岛、桥梁、可能过期 | "《Q1规划》被12篇引用，是核心枢纽" |
| L2 语义洞察 | AI per cluster | cluster内摘要→共同主题/矛盾/重复 | "产品组和运营组各写了留存策略，互不知情" |
| L3 碰撞洞察 | AI per pair | 跨cluster无直连但keyword交集的节点对 | "竞品定价+用户付费意愿→阶梯定价方案" |

### 生成规则

- **L1**：不调 AI，纯计算（入度top-N、出度=0、跨cluster边、高引用但30天未更新）
- **L2**：一次请求处理一个 cluster，输入全部摘要，输出主题标签+发现列表
- **L3**：只取 top-5 碰撞对，避免 token 爆炸。筛选条件：不同cluster + 无直接edge + keyword有交集

### 成本估算（100篇文档）

| 阶段 | 调用次数 |
|------|---------|
| 摘要生成 | ~100 |
| L2 cluster | ~8 |
| L3 碰撞 | ~5 |
| 总计 | ~113 |

---

## 输出格式

> 默认同时输出终端摘要 + 飞书文档沉淀，不需要 --save 标志。

### 终端输出（即时反馈）

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

### 飞书文档输出（沉淀）

自动创建飞书文档，结构：
1. **概览** — 扫描范围、文档数、时间
2. **知识图谱摘要** — 枢纽/孤岛/桥梁列表（带文档链接）
3. **主题聚类** — 每个 cluster 的主题、包含文档、AI 分析
4. **碰撞洞察** — 每对碰撞的详细分析和行动建议
5. **健康度建议** — 建议合并的重复文档、建议更新的过期文档

---

## 技术架构

- **语言**：TypeScript（飞书 CLI 生态原生，Skill 集成最自然）
- **依赖最小化**：飞书 Open API 直接 HTTP 调用、AI 接口（飞书 AI 优先/OpenAI 兼容备选）、图算法手写、chalk 终端美化
- **无数据库**：纯 JSON 文件缓存，个人规模足够

### 目录结构

```
knowledge-explorer/
├── src/
│   ├── index.ts          # Skill 入口，explore 命令
│   ├── collect.ts        # Phase 1: 抓取文档
│   ├── graph.ts          # Phase 2: 建图 + 图算法
│   ├── insights.ts       # Phase 3: AI 洞察生成
│   ├── output.ts         # Phase 4: 终端 + 飞书文档输出
│   ├── cache.ts          # .knowledge-cache 读写
│   └── types.ts          # Node, Edge, Cluster 类型定义
├── .knowledge-cache/     # 运行时生成，gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

## API 权限清单

### 搜索 API 跨空间能力（已验证）

`docs +search` 底层调用 `POST /open-apis/search/v2/doc_wiki/search`，按用户身份搜索所有可访问文档，**无 space_id 参数限制，天然跨空间**。

当前 `wiki spaces` 仅封装了 `get_node`，无 `list spaces` / `list nodes`。如需按空间结构遍历，需用 `lark-cli api` 裸调原生 endpoint。

**MVP 策略**：收集阶段以 `docs +search` 全局搜索为主，空间结构遍历作为后续增强。

### 权限列表

| 阶段 | 操作 | 命令 | scope |
|------|------|------|-------|
| 收集 | 搜索全局文档 | `docs +search` | `search:docs_wiki:readonly` |
| 收集 | 解析 wiki 节点 | `wiki spaces get_node` | `wiki:node:read` |
| 收集 | 读取文档内容 | `docs +fetch` | `docx:document:readonly` |
| 收集 | 读取表格内容 | `sheets +read` | `sheets:spreadsheet:readonly` |
| 收集 | 获取会议纪要 | `vc +notes` | `vc:meeting:readonly` |
| 输出 | 创建报告文档 | `docs +create` | `docx:document` |

共 6 个 scope，5 读 1 写。

---

## 演示策略

### README 结构

1. **30秒 GIF** — 一行命令跑完全流程，终端彩色输出 + 飞书文档链接
2. **为什么需要** — 知识库越大越乱、飞书无图谱视图、团队可能重复造轮子
3. **快速开始** — 三步：安装→授权→explore
4. **能发现什么** — 枢纽/孤岛/聚类/碰撞洞察（附截图）
5. **工作原理** — 四阶段流程图
6. **中英双语** — 扩大受众面

### GIF 录制

- 用真实飞书知识库跑一次，30秒内
- 重点：命令简洁 → 进度条 → 彩色输出 → 飞书文档可点
- 工具：asciinema 或 VHS

### Stars 拉动

- Hacker News / V2EX / 即刻 / Twitter 投放
- 夜识AI 公众号写实战教程（社媒赛道兼得）

---

## 进度跟踪

### 已完成（2026-04-03）

- [x] 项目搭建（TS + vitest + chalk）
- [x] 缓存层（JSON 文件持久化 + 新鲜度检查）
- [x] lark-cli 封装（search / fetch / wiki resolve / doc create）
- [x] Phase 1 收集（搜索 + 去重 + 类型过滤 + 增量缓存）
- [x] Phase 2 建图（link edges / mention edges / AI 摘要 / union-find 聚类）
- [x] Phase 3 洞察（L1 结构 / L2 语义 / L3 碰撞）
- [x] Phase 4 输出（终端彩色报告 + 飞书文档自动创建）
- [x] CLI 入口（单命令全流程编排）
- [x] 集成测试通过（"留学"关键词，16篇文档，5个碰撞洞察）
- [x] GitHub 仓库创建并推送
- [x] 9 个单元测试全部通过

### 集成测试发现的问题（已修复）

- lark-cli 返回格式是 `{ok, data: {...}}` 而非直接返回 data
- 搜索结果有重复 token，需要去重
- SLIDES/SHEET 等类型不能用 docs +fetch，需要过滤
- docs +create 不支持 --format json，不能走 larkJSON
- markdown 内容含特殊字符需用 execFileSync 绕过 shell

### 待做（明天继续）

- [ ] link edges 实测验证（需要有互相引用的文档来测试）
- [ ] semantic edges（AI 判断语义相似的文档对，当前未实现）
- [ ] L2 聚类分析在飞书文档中的展示（当前只有碰撞洞察）
- [ ] 搜索分页优化（当前限制 5 页 100 条，去重后可能只有 20 条 DOCX）
- [ ] README 中的 GIF 录制
- [ ] 报名参赛
- [ ] 轮换通义千问 API key（已暴露在对话历史中）
