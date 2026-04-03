# Knowledge Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI tool that scans Feishu knowledge bases, discovers hidden relationships between documents, and generates actionable insights.

**Architecture:** Four-phase pipeline (Collect → Build Graph → Insights → Output) implemented as a TypeScript CLI. Uses `lark-cli` as the API layer for all Feishu operations. Pure JSON file caching, no database. AI calls via OpenAI-compatible API for portability.

**Tech Stack:** TypeScript, Node.js child_process (lark-cli shell-out), chalk (terminal styling), OpenAI-compatible API (AI summarization/insights)

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/types.ts` | Node, Edge, Cluster, Insight type definitions |
| `src/cache.ts` | Read/write .knowledge-cache/ JSON files, freshness checks |
| `src/lark.ts` | Wrapper around lark-cli shell commands, parse JSON output |
| `src/collect.ts` | Phase 1: Search docs, resolve wiki tokens, fetch content |
| `src/graph.ts` | Phase 2: Build edges (link/mention/semantic), clustering |
| `src/ai.ts` | AI client: summarize, cluster analysis, collision generation |
| `src/insights.ts` | Phase 3: L1 structural + L2 semantic + L3 collision insights |
| `src/output.ts` | Phase 4: Terminal pretty-print + create Feishu document |
| `src/index.ts` | CLI entry point, orchestrate full pipeline |
| `tests/graph.test.ts` | Graph algorithm tests (hub, orphan, bridge, clustering) |
| `tests/insights.test.ts` | L1 insight generation tests |
| `tests/cache.test.ts` | Cache freshness logic tests |
| `package.json` | Dependencies and scripts |
| `tsconfig.json` | TypeScript config |
| `.gitignore` | Ignore .knowledge-cache/, node_modules/, dist/ |

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `src/types.ts`

- [ ] **Step 1: Initialize git repo**

```bash
cd ~/Desktop/knowledge-explorer
git init
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "knowledge-explorer",
  "version": "0.1.0",
  "description": "Scan Feishu knowledge bases, discover hidden relationships, generate actionable insights.",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "knowledge-explorer": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "keywords": ["feishu", "lark", "knowledge-graph", "cli"],
  "license": "MIT"
}
```

- [ ] **Step 3: Install dependencies**

```bash
cd ~/Desktop/knowledge-explorer
npm install typescript chalk@5
npm install -D tsx vitest @types/node
```

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
.knowledge-cache/
*.tsbuildinfo
```

- [ ] **Step 6: Create src/types.ts**

```typescript
// === Data Model ===

export interface KnowledgeNode {
  id: string;                    // wiki node token or doc token
  type: 'wiki' | 'doc' | 'sheet' | 'meeting';
  title: string;
  space: string;                 // space name or id
  url: string;
  updated_at: string;            // ISO 8601
  summary: string;               // AI-generated, ~100 chars
  keywords: string[];            // AI-extracted
  word_count: number;
  fetched_at: string;            // ISO 8601
  content?: string;              // raw markdown content (not persisted in cache)
}

export interface Edge {
  source: string;                // node id
  target: string;                // node id
  type: 'link' | 'mention' | 'semantic';
  weight: number;                // 0-1
  reason?: string;               // only for semantic type
}

export interface Cluster {
  id: string;
  label: string;                 // AI-generated topic label
  node_ids: string[];
  summary?: string;              // AI-generated cluster summary
}

// === Insights ===

export interface StructuralInsight {
  type: 'hub' | 'orphan' | 'bridge' | 'stale';
  node_ids: string[];
  description: string;
}

export interface SemanticInsight {
  cluster_id: string;
  themes: string[];
  contradictions: string[];
  duplicates: string[];
  summary: string;
}

export interface CollisionInsight {
  node_a_id: string;
  node_b_id: string;
  suggestion: string;
  reasoning: string;
}

export interface ExploreResult {
  nodes: KnowledgeNode[];
  edges: Edge[];
  clusters: Cluster[];
  structural_insights: StructuralInsight[];
  semantic_insights: SemanticInsight[];
  collision_insights: CollisionInsight[];
  scanned_at: string;
}

// === Cache ===

export interface CacheMeta {
  version: string;
  scanned_at: string;
  query?: string;
  node_count: number;
}
```

- [ ] **Step 7: Verify TypeScript compiles**

Run: `cd ~/Desktop/knowledge-explorer && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
cd ~/Desktop/knowledge-explorer
git add package.json tsconfig.json .gitignore src/types.ts package-lock.json
git commit -m "feat: project scaffolding with types"
```

---

### Task 2: Cache Layer

**Files:**
- Create: `src/cache.ts`
- Create: `tests/cache.test.ts`

- [ ] **Step 1: Write cache freshness test**

```typescript
// tests/cache.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CacheStore } from '../src/cache.js';
import { rm, mkdir } from 'fs/promises';
import { join } from 'path';

const TEST_DIR = join(import.meta.dirname, '.test-cache');

describe('CacheStore', () => {
  let cache: CacheStore;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    cache = new CacheStore(TEST_DIR);
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('writes and reads nodes', async () => {
    const nodes = [{ id: 'test_1', title: 'Test', type: 'doc' as const,
      space: 's', url: 'u', updated_at: '', summary: '', keywords: [],
      word_count: 0, fetched_at: new Date().toISOString() }];
    await cache.writeNodes(nodes);
    const read = await cache.readNodes();
    expect(read).toHaveLength(1);
    expect(read[0].id).toBe('test_1');
  });

  it('detects stale nodes by updated_at vs fetched_at', () => {
    const node = {
      id: 'n1', type: 'doc' as const, title: '', space: '', url: '',
      updated_at: '2026-04-03T10:00:00Z',
      fetched_at: '2026-04-02T10:00:00Z',
      summary: '', keywords: [], word_count: 0,
    };
    expect(cache.isNodeFresh(node)).toBe(false);

    const fresh = { ...node, fetched_at: '2026-04-03T12:00:00Z' };
    expect(cache.isNodeFresh(fresh)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Desktop/knowledge-explorer && npx vitest run tests/cache.test.ts`
Expected: FAIL — cannot resolve `../src/cache.js`

- [ ] **Step 3: Implement cache.ts**

```typescript
// src/cache.ts
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { KnowledgeNode, Edge, Cluster, CacheMeta } from './types.js';

export class CacheStore {
  constructor(private dir: string) {}

  private path(file: string) { return join(this.dir, file); }

  private async ensureDir() {
    await mkdir(this.dir, { recursive: true });
  }

  private async readJSON<T>(file: string): Promise<T | null> {
    try {
      const raw = await readFile(this.path(file), 'utf-8');
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private async writeJSON(file: string, data: unknown) {
    await this.ensureDir();
    await writeFile(this.path(file), JSON.stringify(data, null, 2));
  }

  // Nodes
  async readNodes(): Promise<KnowledgeNode[]> {
    return (await this.readJSON<KnowledgeNode[]>('nodes.json')) ?? [];
  }
  async writeNodes(nodes: KnowledgeNode[]) {
    await this.writeJSON('nodes.json', nodes);
  }

  // Edges
  async readEdges(): Promise<Edge[]> {
    return (await this.readJSON<Edge[]>('edges.json')) ?? [];
  }
  async writeEdges(edges: Edge[]) {
    await this.writeJSON('edges.json', edges);
  }

  // Clusters
  async readClusters(): Promise<Cluster[]> {
    return (await this.readJSON<Cluster[]>('clusters.json')) ?? [];
  }
  async writeClusters(clusters: Cluster[]) {
    await this.writeJSON('clusters.json', clusters);
  }

  // Meta
  async readMeta(): Promise<CacheMeta | null> {
    return this.readJSON<CacheMeta>('meta.json');
  }
  async writeMeta(meta: CacheMeta) {
    await this.writeJSON('meta.json', meta);
  }

  // Freshness: node is fresh if fetched_at >= updated_at
  isNodeFresh(node: KnowledgeNode): boolean {
    if (!node.fetched_at || !node.updated_at) return false;
    return new Date(node.fetched_at) >= new Date(node.updated_at);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/Desktop/knowledge-explorer && npx vitest run tests/cache.test.ts`
Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/knowledge-explorer
git add src/cache.ts tests/cache.test.ts
git commit -m "feat: cache layer with JSON persistence and freshness check"
```

---

### Task 3: Lark CLI Wrapper

**Files:**
- Create: `src/lark.ts`

- [ ] **Step 1: Implement lark.ts**

```typescript
// src/lark.ts
import { execSync } from 'child_process';

interface LarkExecOptions {
  timeout?: number;  // ms, default 30000
}

function larkExec(args: string[], opts: LarkExecOptions = {}): string {
  const cmd = `lark-cli ${args.join(' ')}`;
  const result = execSync(cmd, {
    encoding: 'utf-8',
    timeout: opts.timeout ?? 30000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return result;
}

function larkJSON<T = unknown>(args: string[], opts?: LarkExecOptions): T {
  const raw = larkExec([...args, '--format', 'json'], opts);
  return JSON.parse(raw) as T;
}

// --- Search ---

interface SearchResult {
  items: Array<{
    doc_id: string;
    title: string;
    url: string;
    type: string;           // DOC, WIKI, SHEET, etc.
    owner_id?: string;
    create_time_iso?: string;
    edit_time_iso?: string;
  }>;
  has_more: boolean;
  page_token?: string;
}

export async function searchDocs(query: string, maxPages = 5): Promise<SearchResult['items']> {
  const allItems: SearchResult['items'] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const args = ['docs', '+search', '--query', JSON.stringify(query), '--page-size', '20'];
    if (pageToken) args.push('--page-token', pageToken);

    const result = larkJSON<SearchResult>(args);
    allItems.push(...(result.items ?? []));

    if (!result.has_more || !result.page_token) break;
    pageToken = result.page_token;
  }

  return allItems;
}

// --- Wiki Node Resolution ---

interface WikiNodeResult {
  node: {
    obj_type: string;      // docx, sheet, bitable, etc.
    obj_token: string;
    title: string;
    space_id: string;
    node_token: string;
  };
}

export async function resolveWikiNode(wikiToken: string): Promise<WikiNodeResult['node']> {
  const result = larkJSON<WikiNodeResult>(
    ['wiki', 'spaces', 'get_node', '--params', JSON.stringify({ token: wikiToken })]
  );
  return result.node;
}

// --- Fetch Document Content ---

interface FetchResult {
  title: string;
  markdown: string;
  has_more: boolean;
}

export async function fetchDocContent(docToken: string): Promise<{ title: string; markdown: string }> {
  const result = larkJSON<FetchResult>(
    ['docs', '+fetch', '--doc', docToken],
    { timeout: 60000 }
  );
  return { title: result.title, markdown: result.markdown };
}

// --- Create Document ---

interface CreateResult {
  doc_id: string;
  doc_url: string;
  message: string;
}

export async function createDoc(title: string, markdown: string, wikiSpace?: string): Promise<CreateResult> {
  const args = ['docs', '+create', '--title', JSON.stringify(title), '--markdown', JSON.stringify(markdown)];
  if (wikiSpace) args.push('--wiki-space', wikiSpace);

  return larkJSON<CreateResult>(args, { timeout: 60000 });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd ~/Desktop/knowledge-explorer && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd ~/Desktop/knowledge-explorer
git add src/lark.ts
git commit -m "feat: lark-cli wrapper for search, fetch, wiki resolve, doc create"
```

---

### Task 4: AI Client

**Files:**
- Create: `src/ai.ts`

- [ ] **Step 1: Implement ai.ts**

```typescript
// src/ai.ts

interface AIConfig {
  apiKey: string;
  baseUrl: string;     // OpenAI-compatible endpoint
  model: string;
}

let config: AIConfig | null = null;

export function configureAI(cfg: AIConfig) {
  config = cfg;
}

async function chatComplete(systemPrompt: string, userPrompt: string): Promise<string> {
  if (!config) throw new Error('AI not configured. Set OPENAI_API_KEY or call configureAI().');

  const resp = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`AI API error ${resp.status}: ${text}`);
  }

  const data = await resp.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0].message.content;
}

// --- Summarize a document ---

export async function summarizeDoc(title: string, content: string): Promise<{ summary: string; keywords: string[] }> {
  const system = `你是知识管理助手。为给定文档生成：
1. 一句话中文摘要（不超过100字）
2. 3-5个关键词

严格以JSON格式返回：{"summary": "...", "keywords": ["...", "..."]}`;

  const user = `文档标题：${title}\n\n文档内容（截取前3000字）：\n${content.slice(0, 3000)}`;
  const raw = await chatComplete(system, user);

  try {
    const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return { summary: title, keywords: [] };
  }
}

// --- Analyze a cluster ---

export async function analyzeCluster(docs: Array<{ title: string; summary: string }>): Promise<{
  theme: string;
  common_topics: string[];
  contradictions: string[];
  duplicates: string[];
  summary: string;
}> {
  const system = `你是知识图谱分析师。分析一组相关文档，找出：
1. 共同主题标签（一个词）
2. 共同讨论的话题列表
3. 矛盾或分歧观点
4. 可能重复的内容

严格以JSON格式返回：{"theme": "...", "common_topics": [...], "contradictions": [...], "duplicates": [...], "summary": "..."}`;

  const user = docs.map((d, i) => `${i + 1}. 《${d.title}》：${d.summary}`).join('\n');
  const raw = await chatComplete(system, user);

  try {
    const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return { theme: '未分类', common_topics: [], contradictions: [], duplicates: [], summary: '' };
  }
}

// --- Generate collision insight ---

export async function generateCollision(
  docA: { title: string; summary: string; keywords: string[] },
  docB: { title: string; summary: string; keywords: string[] },
): Promise<{ suggestion: string; reasoning: string }> {
  const system = `你是创意碰撞专家。两篇从未被关联的文档放在你面前。
分析它们的结合能产生什么新想法或行动建议。

严格以JSON格式返回：{"suggestion": "一句话行动建议", "reasoning": "为什么这两篇可以结合，2-3句话"}`;

  const user = `文档A：《${docA.title}》
摘要：${docA.summary}
关键词：${docA.keywords.join(', ')}

文档B：《${docB.title}》
摘要：${docB.summary}
关键词：${docB.keywords.join(', ')}`;

  const raw = await chatComplete(system, user);

  try {
    const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return { suggestion: '', reasoning: '' };
  }
}

// --- Init from env ---

export function initAIFromEnv() {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.AI_API_KEY;
  if (!apiKey) {
    console.warn('Warning: No AI API key found. Set OPENAI_API_KEY or AI_API_KEY.');
    return;
  }
  configureAI({
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    model: process.env.AI_MODEL ?? 'gpt-4o-mini',
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd ~/Desktop/knowledge-explorer && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd ~/Desktop/knowledge-explorer
git add src/ai.ts
git commit -m "feat: AI client with summarize, cluster analysis, collision generation"
```

---

### Task 5: Phase 1 — Collect

**Files:**
- Create: `src/collect.ts`

- [ ] **Step 1: Implement collect.ts**

```typescript
// src/collect.ts
import { searchDocs, resolveWikiNode, fetchDocContent } from './lark.js';
import { CacheStore } from './cache.js';
import type { KnowledgeNode } from './types.js';
import chalk from 'chalk';

interface CollectOptions {
  query?: string;
  maxPages?: number;
}

export async function collectDocuments(cache: CacheStore, opts: CollectOptions = {}): Promise<KnowledgeNode[]> {
  const query = opts.query ?? '';
  console.log(chalk.blue('📡 正在搜索飞书文档...'));

  // Step 1: Search
  const searchResults = await searchDocs(query, opts.maxPages ?? 5);
  console.log(chalk.blue(`   找到 ${searchResults.length} 篇文档`));

  // Step 2: Load existing cached nodes for freshness check
  const cachedNodes = await cache.readNodes();
  const cachedMap = new Map(cachedNodes.map(n => [n.id, n]));

  // Step 3: Resolve and fetch each document
  const nodes: KnowledgeNode[] = [];
  let fetchCount = 0;

  for (const item of searchResults) {
    const id = item.doc_id;
    const existingNode = cachedMap.get(id);

    // Check freshness: if cached and not updated, reuse
    if (existingNode && existingNode.fetched_at && item.edit_time_iso) {
      if (new Date(existingNode.fetched_at) >= new Date(item.edit_time_iso)) {
        nodes.push(existingNode);
        continue;
      }
    }

    // Fetch content
    try {
      let markdown = '';
      let title = item.title;
      let docType: KnowledgeNode['type'] = 'doc';

      if (item.type === 'WIKI') {
        // Resolve wiki token first
        try {
          const wikiNode = await resolveWikiNode(id);
          docType = 'wiki';
          if (wikiNode.obj_type === 'docx' || wikiNode.obj_type === 'doc') {
            const content = await fetchDocContent(wikiNode.obj_token);
            markdown = content.markdown;
            title = content.title || title;
          }
          // sheets/bitable: skip content fetch for MVP
        } catch {
          // If wiki resolve fails, try direct fetch
          const content = await fetchDocContent(id);
          markdown = content.markdown;
        }
      } else if (item.type === 'DOC' || item.type === 'DOCX') {
        const content = await fetchDocContent(id);
        markdown = content.markdown;
        title = content.title || title;
      } else if (item.type === 'SHEET') {
        docType = 'sheet';
        // Skip content fetch for sheets in MVP
      }

      const node: KnowledgeNode = {
        id,
        type: docType,
        title,
        space: '',  // search API doesn't return space info
        url: item.url,
        updated_at: item.edit_time_iso ?? new Date().toISOString(),
        summary: '',     // filled in Phase 2 by AI
        keywords: [],    // filled in Phase 2 by AI
        word_count: markdown.length,
        fetched_at: new Date().toISOString(),
        content: markdown,
      };

      nodes.push(node);
      fetchCount++;
      process.stdout.write(chalk.gray(`\r   已抓取 ${fetchCount} 篇文档...`));
    } catch (err) {
      console.warn(chalk.yellow(`\n   ⚠ 跳过 ${item.title}: ${(err as Error).message}`));
    }
  }

  console.log(chalk.green(`\n   ✓ 成功收集 ${nodes.length} 篇文档（新抓取 ${fetchCount} 篇）`));

  // Save to cache
  await cache.writeNodes(nodes);
  return nodes;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd ~/Desktop/knowledge-explorer && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd ~/Desktop/knowledge-explorer
git add src/collect.ts
git commit -m "feat: Phase 1 collect — search, resolve, fetch with incremental caching"
```

---

### Task 6: Phase 2 — Build Graph (edges + clustering)

**Files:**
- Create: `src/graph.ts`
- Create: `tests/graph.test.ts`

- [ ] **Step 1: Write graph algorithm tests**

```typescript
// tests/graph.test.ts
import { describe, it, expect } from 'vitest';
import { findLinkEdges, findMentionEdges, clusterNodes } from '../src/graph.js';
import type { KnowledgeNode, Edge } from '../src/types.js';

function makeNode(id: string, title: string, content = '', keywords: string[] = []): KnowledgeNode {
  return {
    id, type: 'doc', title, space: '', url: `https://test.feishu.cn/docx/${id}`,
    updated_at: '', summary: '', keywords, word_count: content.length,
    fetched_at: '', content,
  };
}

describe('findLinkEdges', () => {
  it('detects feishu links in content', () => {
    const nodes = [
      makeNode('aaa', 'Doc A', 'See [related](https://test.feishu.cn/docx/bbb) for details'),
      makeNode('bbb', 'Doc B', 'No links here'),
    ];
    const edges = findLinkEdges(nodes);
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('aaa');
    expect(edges[0].target).toBe('bbb');
    expect(edges[0].type).toBe('link');
  });
});

describe('findMentionEdges', () => {
  it('detects title mentions in other docs', () => {
    const nodes = [
      makeNode('aaa', 'Q1规划', '这是Q1规划文档'),
      makeNode('bbb', 'Q1回顾', '参考Q1规划中的目标'),
    ];
    const edges = findMentionEdges(nodes);
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('bbb');
    expect(edges[0].target).toBe('aaa');
    expect(edges[0].type).toBe('mention');
  });
});

describe('clusterNodes', () => {
  it('groups connected nodes into clusters', () => {
    const nodes = [makeNode('a', 'A'), makeNode('b', 'B'), makeNode('c', 'C'), makeNode('d', 'D')];
    const edges: Edge[] = [
      { source: 'a', target: 'b', type: 'link', weight: 1 },
      { source: 'c', target: 'd', type: 'link', weight: 1 },
    ];
    const clusters = clusterNodes(nodes, edges);
    expect(clusters).toHaveLength(2);
    // a,b in one cluster; c,d in another
    const clusterIds = clusters.map(c => c.node_ids.sort().join(','));
    expect(clusterIds).toContain('a,b');
    expect(clusterIds).toContain('c,d');
  });

  it('puts isolated nodes in their own cluster', () => {
    const nodes = [makeNode('a', 'A'), makeNode('b', 'B')];
    const edges: Edge[] = [];
    const clusters = clusterNodes(nodes, edges);
    expect(clusters).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Desktop/knowledge-explorer && npx vitest run tests/graph.test.ts`
Expected: FAIL — cannot resolve `../src/graph.js`

- [ ] **Step 3: Implement graph.ts**

```typescript
// src/graph.ts
import type { KnowledgeNode, Edge, Cluster } from './types.js';
import { summarizeDoc } from './ai.js';
import chalk from 'chalk';

// --- Link Edges: parse feishu URLs from content ---

const FEISHU_URL_RE = /https?:\/\/[a-z0-9.-]*(?:feishu\.cn|larksuite\.com)\/(?:docx|doc|wiki|sheets)\/([A-Za-z0-9]+)/g;

export function findLinkEdges(nodes: KnowledgeNode[]): Edge[] {
  const idSet = new Set(nodes.map(n => n.id));
  const edges: Edge[] = [];

  for (const node of nodes) {
    if (!node.content) continue;
    const matches = node.content.matchAll(FEISHU_URL_RE);
    const seen = new Set<string>();
    for (const m of matches) {
      const targetId = m[1];
      if (targetId !== node.id && idSet.has(targetId) && !seen.has(targetId)) {
        seen.add(targetId);
        edges.push({ source: node.id, target: targetId, type: 'link', weight: 1.0 });
      }
    }
  }

  return edges;
}

// --- Mention Edges: title appears in another doc's content ---

export function findMentionEdges(nodes: KnowledgeNode[]): Edge[] {
  const edges: Edge[] = [];
  const linkPairs = new Set<string>(); // avoid duplicating link edges

  for (const source of nodes) {
    if (!source.content) continue;
    for (const target of nodes) {
      if (source.id === target.id) continue;
      if (target.title.length < 2) continue; // skip very short titles
      if (source.content.includes(target.title)) {
        const key = `${source.id}->${target.id}`;
        if (!linkPairs.has(key)) {
          linkPairs.add(key);
          edges.push({ source: source.id, target: target.id, type: 'mention', weight: 0.6 });
        }
      }
    }
  }

  return edges;
}

// --- AI Summaries ---

export async function generateSummaries(nodes: KnowledgeNode[]): Promise<void> {
  const needSummary = nodes.filter(n => !n.summary && n.content);
  if (needSummary.length === 0) return;

  console.log(chalk.blue(`🤖 正在生成 ${needSummary.length} 篇文档的 AI 摘要...`));
  let done = 0;

  for (const node of needSummary) {
    try {
      const result = await summarizeDoc(node.title, node.content!);
      node.summary = result.summary;
      node.keywords = result.keywords;
      done++;
      process.stdout.write(chalk.gray(`\r   已完成 ${done}/${needSummary.length}`));
    } catch (err) {
      console.warn(chalk.yellow(`\n   ⚠ 摘要生成失败: ${node.title}`));
    }
  }
  console.log(chalk.green(`\n   ✓ 摘要生成完成`));
}

// --- Clustering: connected components via union-find ---

export function clusterNodes(nodes: KnowledgeNode[], edges: Edge[]): Cluster[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  };
  const union = (a: string, b: string) => {
    parent.set(find(a), find(b));
  };

  // Initialize all nodes
  for (const n of nodes) parent.set(n.id, n.id);

  // Union connected nodes
  for (const e of edges) {
    if (e.weight >= 0.3) {  // threshold for clustering
      union(e.source, e.target);
    }
  }

  // Group by root
  const groups = new Map<string, string[]>();
  for (const n of nodes) {
    const root = find(n.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(n.id);
  }

  // Convert to Cluster objects
  let idx = 0;
  const clusters: Cluster[] = [];
  for (const [, nodeIds] of groups) {
    clusters.push({
      id: `cluster_${idx++}`,
      label: '',  // filled later by AI
      node_ids: nodeIds,
    });
  }

  return clusters;
}

// --- Full graph build pipeline ---

export async function buildGraph(nodes: KnowledgeNode[]): Promise<{ edges: Edge[]; clusters: Cluster[] }> {
  console.log(chalk.blue('🔗 正在构建知识图谱...'));

  // Step 1: Link edges
  const linkEdges = findLinkEdges(nodes);
  console.log(chalk.gray(`   发现 ${linkEdges.length} 条链接关系`));

  // Step 2: Mention edges
  const mentionEdges = findMentionEdges(nodes);
  console.log(chalk.gray(`   发现 ${mentionEdges.length} 条提及关系`));

  // Step 3: AI summaries
  await generateSummaries(nodes);

  // Step 4: All edges combined (semantic edges skipped for MVP speed)
  const allEdges = [...linkEdges, ...mentionEdges];

  // Step 5: Clustering
  const clusters = clusterNodes(nodes, allEdges);
  console.log(chalk.green(`   ✓ 图谱构建完成: ${allEdges.length} 条边, ${clusters.length} 个聚类`));

  return { edges: allEdges, clusters };
}
```

- [ ] **Step 4: Run tests**

Run: `cd ~/Desktop/knowledge-explorer && npx vitest run tests/graph.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/knowledge-explorer
git add src/graph.ts tests/graph.test.ts
git commit -m "feat: Phase 2 graph — link/mention edges, union-find clustering, AI summaries"
```

---

### Task 7: Phase 3 — Insights

**Files:**
- Create: `src/insights.ts`
- Create: `tests/insights.test.ts`

- [ ] **Step 1: Write L1 structural insight tests**

```typescript
// tests/insights.test.ts
import { describe, it, expect } from 'vitest';
import { computeStructuralInsights } from '../src/insights.js';
import type { KnowledgeNode, Edge, Cluster } from '../src/types.js';

function makeNode(id: string, title: string, updated_at = '2026-04-01T00:00:00Z'): KnowledgeNode {
  return {
    id, type: 'doc', title, space: '', url: '', updated_at,
    summary: '', keywords: [], word_count: 100, fetched_at: '2026-04-03T00:00:00Z',
  };
}

describe('computeStructuralInsights', () => {
  it('identifies hub nodes (high in-degree)', () => {
    const nodes = [makeNode('a', 'Hub'), makeNode('b', 'B'), makeNode('c', 'C'), makeNode('d', 'D')];
    const edges: Edge[] = [
      { source: 'b', target: 'a', type: 'link', weight: 1 },
      { source: 'c', target: 'a', type: 'link', weight: 1 },
      { source: 'd', target: 'a', type: 'mention', weight: 0.6 },
    ];
    const clusters: Cluster[] = [{ id: 'c0', label: '', node_ids: ['a', 'b', 'c', 'd'] }];

    const insights = computeStructuralInsights(nodes, edges, clusters);
    const hubs = insights.filter(i => i.type === 'hub');
    expect(hubs.length).toBeGreaterThanOrEqual(1);
    expect(hubs[0].node_ids).toContain('a');
  });

  it('identifies orphan nodes (no edges)', () => {
    const nodes = [makeNode('a', 'A'), makeNode('b', 'Lonely')];
    const edges: Edge[] = [];
    const clusters: Cluster[] = [
      { id: 'c0', label: '', node_ids: ['a'] },
      { id: 'c1', label: '', node_ids: ['b'] },
    ];

    const insights = computeStructuralInsights(nodes, edges, clusters);
    const orphans = insights.filter(i => i.type === 'orphan');
    expect(orphans).toHaveLength(1);
    expect(orphans[0].node_ids).toContain('a');
    expect(orphans[0].node_ids).toContain('b');
  });

  it('identifies stale nodes (old update, high in-degree)', () => {
    const staleDate = '2026-01-01T00:00:00Z'; // >30 days ago
    const nodes = [makeNode('a', 'Stale Hub', staleDate), makeNode('b', 'B'), makeNode('c', 'C')];
    const edges: Edge[] = [
      { source: 'b', target: 'a', type: 'link', weight: 1 },
      { source: 'c', target: 'a', type: 'link', weight: 1 },
    ];
    const clusters: Cluster[] = [{ id: 'c0', label: '', node_ids: ['a', 'b', 'c'] }];

    const insights = computeStructuralInsights(nodes, edges, clusters);
    const stale = insights.filter(i => i.type === 'stale');
    expect(stale.length).toBeGreaterThanOrEqual(1);
    expect(stale[0].node_ids).toContain('a');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Desktop/knowledge-explorer && npx vitest run tests/insights.test.ts`
Expected: FAIL — cannot resolve `../src/insights.js`

- [ ] **Step 3: Implement insights.ts**

```typescript
// src/insights.ts
import type {
  KnowledgeNode, Edge, Cluster,
  StructuralInsight, SemanticInsight, CollisionInsight,
} from './types.js';
import { analyzeCluster, generateCollision } from './ai.js';
import chalk from 'chalk';

// --- L1: Structural Insights (no AI) ---

export function computeStructuralInsights(
  nodes: KnowledgeNode[], edges: Edge[], clusters: Cluster[]
): StructuralInsight[] {
  const insights: StructuralInsight[] = [];
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // In-degree count
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  for (const n of nodes) {
    inDegree.set(n.id, 0);
    outDegree.set(n.id, 0);
  }
  for (const e of edges) {
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    outDegree.set(e.source, (outDegree.get(e.source) ?? 0) + 1);
  }

  // Hubs: top in-degree nodes (>= 2 incoming)
  const hubThreshold = 2;
  const hubs = nodes
    .filter(n => (inDegree.get(n.id) ?? 0) >= hubThreshold)
    .sort((a, b) => (inDegree.get(b.id) ?? 0) - (inDegree.get(a.id) ?? 0));

  if (hubs.length > 0) {
    insights.push({
      type: 'hub',
      node_ids: hubs.map(n => n.id),
      description: hubs.map(n => `《${n.title}》被 ${inDegree.get(n.id)} 篇文档引用`).join('；'),
    });
  }

  // Orphans: nodes with no edges at all
  const connectedIds = new Set<string>();
  for (const e of edges) {
    connectedIds.add(e.source);
    connectedIds.add(e.target);
  }
  const orphans = nodes.filter(n => !connectedIds.has(n.id));
  if (orphans.length > 0) {
    insights.push({
      type: 'orphan',
      node_ids: orphans.map(n => n.id),
      description: `${orphans.length} 篇孤岛文档与其他文档无关联`,
    });
  }

  // Bridges: nodes that appear in edges crossing clusters
  const nodeClusterMap = new Map<string, string>();
  for (const c of clusters) {
    for (const nid of c.node_ids) nodeClusterMap.set(nid, c.id);
  }
  const bridgeNodes = new Set<string>();
  for (const e of edges) {
    const sc = nodeClusterMap.get(e.source);
    const tc = nodeClusterMap.get(e.target);
    if (sc && tc && sc !== tc) {
      bridgeNodes.add(e.source);
      bridgeNodes.add(e.target);
    }
  }
  if (bridgeNodes.size > 0) {
    const bridgeList = [...bridgeNodes].map(id => nodeMap.get(id)!).filter(Boolean);
    insights.push({
      type: 'bridge',
      node_ids: [...bridgeNodes],
      description: bridgeList.map(n => `《${n.title}》连接多个主题群`).join('；'),
    });
  }

  // Stale: high in-degree but >30 days without update
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const staleNodes = nodes.filter(n => {
    const age = now - new Date(n.updated_at).getTime();
    return age > thirtyDays && (inDegree.get(n.id) ?? 0) >= 2;
  });
  if (staleNodes.length > 0) {
    insights.push({
      type: 'stale',
      node_ids: staleNodes.map(n => n.id),
      description: staleNodes.map(n => {
        const days = Math.floor((now - new Date(n.updated_at).getTime()) / (24 * 60 * 60 * 1000));
        return `《${n.title}》${days}天未更新，被 ${inDegree.get(n.id)} 篇引用`;
      }).join('；'),
    });
  }

  return insights;
}

// --- L2: Semantic Insights (AI per cluster) ---

export async function computeSemanticInsights(
  nodes: KnowledgeNode[], clusters: Cluster[]
): Promise<SemanticInsight[]> {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const insights: SemanticInsight[] = [];

  // Only analyze clusters with >= 2 nodes
  const multiClusters = clusters.filter(c => c.node_ids.length >= 2);
  if (multiClusters.length === 0) return insights;

  console.log(chalk.blue(`🧠 正在分析 ${multiClusters.length} 个主题聚类...`));

  for (const cluster of multiClusters) {
    const docs = cluster.node_ids
      .map(id => nodeMap.get(id))
      .filter((n): n is KnowledgeNode => !!n && !!n.summary)
      .map(n => ({ title: n.title, summary: n.summary }));

    if (docs.length < 2) continue;

    try {
      const result = await analyzeCluster(docs);
      cluster.label = result.theme;
      cluster.summary = result.summary;

      insights.push({
        cluster_id: cluster.id,
        themes: result.common_topics,
        contradictions: result.contradictions,
        duplicates: result.duplicates,
        summary: result.summary,
      });
    } catch {
      console.warn(chalk.yellow(`   ⚠ 聚类分析失败: ${cluster.id}`));
    }
  }

  console.log(chalk.green(`   ✓ 聚类分析完成`));
  return insights;
}

// --- L3: Collision Insights (AI per pair, top-5) ---

export async function computeCollisionInsights(
  nodes: KnowledgeNode[], edges: Edge[], clusters: Cluster[]
): Promise<CollisionInsight[]> {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const nodeCluster = new Map<string, string>();
  for (const c of clusters) {
    for (const nid of c.node_ids) nodeCluster.set(nid, c.id);
  }

  // Direct edge pairs to exclude
  const directPairs = new Set<string>();
  for (const e of edges) {
    directPairs.add(`${e.source}:${e.target}`);
    directPairs.add(`${e.target}:${e.source}`);
  }

  // Find candidate pairs: different cluster, no direct edge, keyword overlap
  interface Candidate { a: KnowledgeNode; b: KnowledgeNode; overlap: number }
  const candidates: Candidate[] = [];

  const nodesWithKeywords = nodes.filter(n => n.keywords.length > 0 && n.summary);
  for (let i = 0; i < nodesWithKeywords.length; i++) {
    for (let j = i + 1; j < nodesWithKeywords.length; j++) {
      const a = nodesWithKeywords[i];
      const b = nodesWithKeywords[j];

      // Different cluster?
      if (nodeCluster.get(a.id) === nodeCluster.get(b.id)) continue;

      // No direct edge?
      if (directPairs.has(`${a.id}:${b.id}`)) continue;

      // Keyword overlap?
      const overlap = a.keywords.filter(k => b.keywords.includes(k)).length;
      if (overlap > 0) {
        candidates.push({ a, b, overlap });
      }
    }
  }

  // Sort by overlap, take top 5
  candidates.sort((x, y) => y.overlap - x.overlap);
  const top = candidates.slice(0, 5);

  if (top.length === 0) return [];

  console.log(chalk.blue(`💡 正在生成 ${top.length} 个碰撞洞察...`));
  const insights: CollisionInsight[] = [];

  for (const { a, b } of top) {
    try {
      const result = await generateCollision(
        { title: a.title, summary: a.summary, keywords: a.keywords },
        { title: b.title, summary: b.summary, keywords: b.keywords },
      );
      if (result.suggestion) {
        insights.push({
          node_a_id: a.id,
          node_b_id: b.id,
          suggestion: result.suggestion,
          reasoning: result.reasoning,
        });
      }
    } catch {
      // skip failed pairs
    }
  }

  console.log(chalk.green(`   ✓ 碰撞洞察生成完成`));
  return insights;
}
```

- [ ] **Step 4: Run tests**

Run: `cd ~/Desktop/knowledge-explorer && npx vitest run tests/insights.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/knowledge-explorer
git add src/insights.ts tests/insights.test.ts
git commit -m "feat: Phase 3 insights — L1 structural, L2 semantic, L3 collision"
```

---

### Task 8: Phase 4 — Output (Terminal + Feishu Doc)

**Files:**
- Create: `src/output.ts`

- [ ] **Step 1: Implement output.ts**

```typescript
// src/output.ts
import type {
  KnowledgeNode, Edge, Cluster,
  StructuralInsight, SemanticInsight, CollisionInsight, ExploreResult,
} from './types.js';
import { createDoc } from './lark.js';
import chalk from 'chalk';

// --- Terminal Output ---

export function printTerminalReport(result: ExploreResult): void {
  const { nodes, edges, clusters, structural_insights, semantic_insights, collision_insights } = result;

  console.log('');
  console.log(chalk.bold(`🔍 扫描完成：${nodes.length} 篇文档`));
  console.log('');

  // Health
  console.log(chalk.bold('📊 知识健康度'));
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  for (const insight of structural_insights) {
    const icon = { hub: '🏛', orphan: '🏝', bridge: '🌉', stale: '⏰' }[insight.type];
    const label = { hub: '枢纽文档', orphan: '孤岛文档', bridge: '桥梁文档', stale: '可能过期' }[insight.type];
    const names = insight.node_ids.slice(0, 3).map(id => nodeMap.get(id)?.title ?? id);
    const suffix = insight.node_ids.length > 3 ? ` 等${insight.node_ids.length}篇` : '';
    console.log(chalk.gray(`  ${icon} ${label} (${insight.node_ids.length})：${names.join('、')}${suffix}`));
  }

  // Clusters
  const namedClusters = clusters.filter(c => c.label && c.node_ids.length >= 2);
  if (namedClusters.length > 0) {
    console.log('');
    console.log(chalk.bold(`🔗 发现 ${namedClusters.length} 个主题聚类`));
    for (const c of namedClusters) {
      console.log(chalk.gray(`  ├ #${c.label} (${c.node_ids.length}篇)`));
    }
  }

  // Collisions
  if (collision_insights.length > 0) {
    console.log('');
    console.log(chalk.bold(`💡 碰撞洞察 (Top ${collision_insights.length})`));
    collision_insights.forEach((ci, i) => {
      const a = nodeMap.get(ci.node_a_id)?.title ?? ci.node_a_id;
      const b = nodeMap.get(ci.node_b_id)?.title ?? ci.node_b_id;
      console.log(chalk.yellow(`  ${i + 1}.《${a}》×《${b}》→ ${ci.suggestion}`));
    });
  }

  console.log('');
}

// --- Feishu Document Output ---

function buildFeishuMarkdown(result: ExploreResult): string {
  const { nodes, clusters, structural_insights, semantic_insights, collision_insights } = result;
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const parts: string[] = [];

  // Overview
  parts.push(`## 概览\n`);
  parts.push(`- 扫描时间：${result.scanned_at}`);
  parts.push(`- 文档数量：${nodes.length} 篇`);
  parts.push(`- 关系数量：${result.edges.length} 条`);
  parts.push(`- 主题聚类：${clusters.length} 个`);
  parts.push('');

  // Structural insights
  if (structural_insights.length > 0) {
    parts.push(`## 知识图谱摘要\n`);
    for (const insight of structural_insights) {
      const label = { hub: '🏛 枢纽文档', orphan: '🏝 孤岛文档', bridge: '🌉 桥梁文档', stale: '⏰ 可能过期' }[insight.type];
      parts.push(`### ${label}\n`);
      for (const nid of insight.node_ids) {
        const n = nodeMap.get(nid);
        if (n) parts.push(`- [${n.title}](${n.url})`);
      }
      parts.push(`\n${insight.description}\n`);
    }
  }

  // Cluster analysis
  const namedClusters = clusters.filter(c => c.label && c.node_ids.length >= 2);
  if (namedClusters.length > 0) {
    parts.push(`## 主题聚类\n`);
    for (const c of namedClusters) {
      parts.push(`### #${c.label} (${c.node_ids.length}篇)\n`);
      for (const nid of c.node_ids) {
        const n = nodeMap.get(nid);
        if (n) parts.push(`- [${n.title}](${n.url})`);
      }
      // Find matching semantic insight
      const si = semantic_insights.find(s => s.cluster_id === c.id);
      if (si) {
        parts.push(`\n${si.summary}`);
        if (si.contradictions.length > 0) {
          parts.push(`\n<callout emoji="⚠️" background-color="light-yellow">\n**矛盾观点：** ${si.contradictions.join('；')}\n</callout>`);
        }
        if (si.duplicates.length > 0) {
          parts.push(`\n<callout emoji="📋" background-color="light-blue">\n**可能重复：** ${si.duplicates.join('；')}\n</callout>`);
        }
      }
      parts.push('');
    }
  }

  // Collision insights
  if (collision_insights.length > 0) {
    parts.push(`## 碰撞洞察\n`);
    for (const ci of collision_insights) {
      const a = nodeMap.get(ci.node_a_id);
      const b = nodeMap.get(ci.node_b_id);
      const aTitle = a ? `[${a.title}](${a.url})` : ci.node_a_id;
      const bTitle = b ? `[${b.title}](${b.url})` : ci.node_b_id;
      parts.push(`### ${aTitle} × ${bTitle}\n`);
      parts.push(`<callout emoji="💡" background-color="light-green">\n**建议：** ${ci.suggestion}\n</callout>\n`);
      parts.push(`${ci.reasoning}\n`);
    }
  }

  return parts.join('\n');
}

export async function publishToFeishu(result: ExploreResult): Promise<string | null> {
  const markdown = buildFeishuMarkdown(result);
  const title = `知识探索报告 ${result.scanned_at.split('T')[0]}`;

  try {
    console.log(chalk.blue('📄 正在创建飞书文档...'));
    const doc = await createDoc(title, markdown);
    console.log(chalk.green(`   ✓ 报告已生成 → ${doc.doc_url}`));
    return doc.doc_url;
  } catch (err) {
    console.warn(chalk.yellow(`   ⚠ 飞书文档创建失败: ${(err as Error).message}`));
    console.warn(chalk.yellow('   提示：请确认 lark-cli 已登录且有 docx:document scope'));
    return null;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd ~/Desktop/knowledge-explorer && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd ~/Desktop/knowledge-explorer
git add src/output.ts
git commit -m "feat: Phase 4 output — terminal report + Feishu doc with Lark-flavored markdown"
```

---

### Task 9: CLI Entry Point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Implement index.ts**

```typescript
#!/usr/bin/env node
// src/index.ts
import { CacheStore } from './cache.js';
import { collectDocuments } from './collect.js';
import { buildGraph } from './graph.js';
import { computeStructuralInsights, computeSemanticInsights, computeCollisionInsights } from './insights.js';
import { printTerminalReport, publishToFeishu } from './output.js';
import { initAIFromEnv } from './ai.js';
import type { ExploreResult } from './types.js';
import chalk from 'chalk';
import { join } from 'path';

async function explore(query?: string) {
  console.log(chalk.bold.cyan('\n🔍 Knowledge Explorer — 飞书知识探索器\n'));

  // Init AI
  initAIFromEnv();

  // Init cache
  const cacheDir = join(process.cwd(), '.knowledge-cache');
  const cache = new CacheStore(cacheDir);

  // Phase 1: Collect
  const nodes = await collectDocuments(cache, { query });

  if (nodes.length === 0) {
    console.log(chalk.yellow('未找到任何文档。请检查搜索关键词或 lark-cli 登录状态。'));
    process.exit(0);
  }

  // Phase 2: Build Graph
  const { edges, clusters } = await buildGraph(nodes);
  await cache.writeEdges(edges);
  await cache.writeClusters(clusters);

  // Phase 3: Insights
  const structural = computeStructuralInsights(nodes, edges, clusters);
  const semantic = await computeSemanticInsights(nodes, clusters);
  const collisions = await computeCollisionInsights(nodes, edges, clusters);

  // Save final node state (with summaries)
  await cache.writeNodes(nodes.map(n => ({ ...n, content: undefined })));
  await cache.writeMeta({
    version: '0.1.0',
    scanned_at: new Date().toISOString(),
    query,
    node_count: nodes.length,
  });

  // Build result
  const result: ExploreResult = {
    nodes,
    edges,
    clusters,
    structural_insights: structural,
    semantic_insights: semantic,
    collision_insights: collisions,
    scanned_at: new Date().toISOString(),
  };

  // Phase 4: Output
  printTerminalReport(result);
  await publishToFeishu(result);

  console.log(chalk.bold.cyan('\n✨ 探索完成\n'));
}

// Parse CLI args
const args = process.argv.slice(2);
const query = args.find(a => !a.startsWith('-'));

explore(query).catch(err => {
  console.error(chalk.red(`\n❌ 错误: ${err.message}`));
  process.exit(1);
});
```

- [ ] **Step 2: Verify build**

Run: `cd ~/Desktop/knowledge-explorer && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run all tests**

Run: `cd ~/Desktop/knowledge-explorer && npx vitest run`
Expected: All tests pass (cache: 2, graph: 4, insights: 3 = 9 tests)

- [ ] **Step 4: Commit**

```bash
cd ~/Desktop/knowledge-explorer
git add src/index.ts
git commit -m "feat: CLI entry point — orchestrate full explore pipeline"
```

---

### Task 10: README + Final Polish

**Files:**
- Create: `README.md` (English + Chinese)
- Modify: `package.json` (add repository field)

- [ ] **Step 1: Write README.md**

```markdown
# 🔍 Knowledge Explorer — 飞书知识探索器

Scan your Feishu (Lark) knowledge base, automatically discover hidden relationships between documents, and generate actionable insights.

扫描飞书知识库，自动发现文档间的隐藏关系，生成可行动的洞察。

## Why?

- Your knowledge base grows messy as it scales — connections between documents live only in your head
- Feishu has no graph view like Obsidian
- Your team might be writing duplicate content without knowing

## Quick Start

### Prerequisites

- [lark-cli](https://github.com/nicepkg/lark-cli) installed and authenticated
- Node.js >= 18
- An OpenAI-compatible API key (for AI insights)

### Install

```bash
git clone https://github.com/YOUR_USERNAME/knowledge-explorer.git
cd knowledge-explorer
npm install
npm run build
```

### Run

```bash
# Set your AI API key
export OPENAI_API_KEY=sk-xxx

# Explore all accessible documents
npx knowledge-explorer

# Search specific topics
npx knowledge-explorer "产品规划"
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI-compatible API key |
| `OPENAI_BASE_URL` | No | Custom API endpoint (default: OpenAI) |
| `AI_MODEL` | No | Model name (default: gpt-4o-mini) |

## What It Discovers

### 📊 Knowledge Health
- **Hub documents** — highly referenced, central to your knowledge
- **Orphan documents** — isolated, no connections to others
- **Bridge documents** — connect different topic clusters
- **Stale documents** — frequently referenced but not updated

### 🔗 Topic Clusters
Automatically groups related documents and identifies common themes, contradictions, and duplicates within each cluster.

### 💡 Collision Insights
Finds documents from different clusters that share hidden connections, and generates creative suggestions for combining their ideas.

## How It Works

```
Phase 1: Collect     Search & fetch documents via lark-cli
    ↓
Phase 2: Build Graph     Discover links, mentions, semantic relations
    ↓
Phase 3: Insights     L1 structural → L2 semantic → L3 collision
    ↓
Phase 4: Output     Terminal report + Feishu document
```

## Output

- **Terminal**: Colored summary with key findings
- **Feishu Document**: Auto-created report with full analysis, document links, and action suggestions

## Tech Stack

- TypeScript
- lark-cli (Feishu API layer)
- OpenAI-compatible API (AI analysis)
- Pure JSON caching (no database)

## License

MIT
```

- [ ] **Step 2: Verify full build and tests**

Run: `cd ~/Desktop/knowledge-explorer && npm run build && npx vitest run`
Expected: Build succeeds, all 9 tests pass

- [ ] **Step 3: Commit all**

```bash
cd ~/Desktop/knowledge-explorer
git add README.md
git commit -m "docs: README with bilingual intro, quick start, and architecture overview"
```

---

### Task 11: Integration Test with Real Feishu

**Files:** None (manual verification)

- [ ] **Step 1: Verify lark-cli authentication**

```bash
lark-cli docs +search --query "测试" --format json
```

Expected: Returns JSON with document results (confirms auth works)

- [ ] **Step 2: Run knowledge-explorer end-to-end**

```bash
cd ~/Desktop/knowledge-explorer
export OPENAI_API_KEY=sk-xxx  # or your actual key
npx tsx src/index.ts "测试"
```

Expected:
- Search finds documents
- AI summaries are generated
- Terminal report is printed
- Feishu document is created with a URL

- [ ] **Step 3: Verify the created Feishu document**

Open the printed URL in browser. Check that:
- Document title is "知识探索报告 YYYY-MM-DD"
- Sections: 概览, 知识图谱摘要, 主题聚类, 碰撞洞察
- Document links are clickable
- Callout blocks render correctly

- [ ] **Step 4: Fix any issues found, commit**

```bash
cd ~/Desktop/knowledge-explorer
git add -A
git commit -m "fix: adjustments from integration testing"
```

- [ ] **Step 5: Record demo GIF**

```bash
# Install VHS or asciinema
brew install vhs  # or: brew install asciinema

# Record a 30-second demo
# Focus on: one-line command → progress → colorful output → Feishu link
```

Save GIF to `assets/demo.gif`, add to README.

- [ ] **Step 6: Final commit and tag**

```bash
cd ~/Desktop/knowledge-explorer
git add -A
git commit -m "docs: add demo GIF"
git tag v0.1.0
```
