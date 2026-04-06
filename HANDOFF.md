# Handoff — 2026-04-06

## 当前状态

v0.4 Codex review 反馈已全部修复，**代码已改但未提交/推送**。

## 本轮改动（未提交）

| 文件 | 改动 |
|------|------|
| `src/insights.ts` | 边类型分权：link/mention=1.0, semantic=0.3；hub/stale 描述区分"引用"和"语义关联" |
| `src/graph.ts` | mention 边：min 4 chars + 停止词 + 边界检查 + weight 分级 |
| `src/ai.ts` | 3x retry + exponential backoff + `safeParseJSON` |
| `src/types.ts` | type 枚举收窄为 `wiki|doc` |
| `LICENSE` | 新增 MIT |
| `README.md` / `README.zh.md` | hub/stale 措辞对齐 |
| `DESIGN.md` | 跨源聚合标注 planned |

验证状态：`npm test` 7/7 ✅ · `npm run build` ✅

## 下一步

1. `git add` + `git commit` + `git push`（提交 Codex review 修复）
2. npm publish（用户需先 `npm adduser`）
3. GIF 录制（asciinema / VHS）
4. 报名参赛
5. 推广（截止 4/20-25 统计 Stars）

## 上下文

- Codex review PDF: `/Users/coni/Downloads/无标题.pdf`
- Memory: `~/.claude/projects/-Users-coni/memory/project-knowledge-explorer.md`
- 仓库: `https://github.com/coni555/lark-knowledge-explorer`
