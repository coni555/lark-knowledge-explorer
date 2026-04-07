# Handoff — 2026-04-07 (Session 3)

## 当前状态

v0.4.0 代码基础上新增筛选功能（`--folder`、`--list-tree`），未发版未提交。进入「提交推送 → 报名 → 推广」阶段。

## 本轮完成

| 项目 | 状态 |
|------|------|
| `--folder <node_token>` 文件夹级筛选 | ✅ 可限定子树范围探索 |
| `--list-tree <space_id>` 树形浏览 | ✅ 输出缩进树 + 类型图标 + node_token |
| `listAllSpaceNodes` 支持 startNodeToken | ✅ lark.ts |
| README 更新（新参数文档） | ✅ |
| 命名修正 `--list-nodes` → `--list-tree` | ✅ 避免误导 |

## 筛选能力汇总

| 维度 | 参数 | 值 |
|------|------|------|
| 空间 | `--space <id>` | 限定单个知识空间 |
| 文件夹 | `--folder <node_token>` | 限定子树（需配合 `--space`） |
| 作者 | `--owner me\|others\|<name>` | 按文档归属过滤 |
| 关键词 | `--query <keyword>` | 切换为搜索模式 |
| 浏览树 | `--list-tree <space_id>` | 查看空间结构找 node_token |

## 待做

- [ ] GIF 加入 README（替换 TODO 注释）→ 提交推送
- [ ] 报名参赛
- [ ] 推广（V2EX / 即刻 / 夜识AI 公众号）
- [ ] 继续打磨（截止 4/20 报名，4/20-25 统计 Stars）

## 未提交文件

- `HANDOFF.md`（已修改）
- `docs/demo.gif`、`docs/demo.mp4`、`docs/demo-rc.sh`、`docs/demo-run.sh`、`docs/demo.tape`（未跟踪）
- `.env.save`（不应提交）
- `2026-04-04-*.txt`（临时文件，不应提交）

## 上下文

- 项目目录：`~/Desktop/knowledge-explorer/`
- GitHub：`https://github.com/coni555/lark-knowledge-explorer`
- npm：`https://www.npmjs.com/package/lark-knowledge-explorer`
- Skill：`~/.claude/skills/knowledge-explorer` → 项目目录
- Memory：`~/.claude/projects/-Users-coni/memory/project-knowledge-explorer.md`
