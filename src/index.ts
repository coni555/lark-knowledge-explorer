#!/usr/bin/env node
// src/index.ts
import { existsSync } from 'fs';
import { join } from 'path';

// Auto-load .env if present (Node 20.6+ built-in)
const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

import { CacheStore } from './cache.js';
import { collectDocuments } from './collect.js';
import { buildGraph } from './graph.js';
import { computeStructuralInsights, computeSemanticInsights, computeCollisionInsights } from './insights.js';
import { printTerminalReport, publishToFeishu } from './output.js';
import { initAIFromEnv, isAIConfigured } from './ai.js';
import { listSpaces, listAllSpaceNodes, getRootFolderToken, listAllDriveFiles } from './lark.js';
import type { ExploreResult } from './types.js';
import chalk from 'chalk';

// --- Phase runners ---

async function runCollect(cache: CacheStore, opts: {
  mode: 'full-scan' | 'keyword-search' | 'drive-scan';
  query?: string;
  spaceId?: string;
  maxPages?: number;
  owner?: string;
  folder?: string;
  driveFolder?: string;
}) {
  const collectResult = await collectDocuments(cache, {
    mode: opts.mode,
    query: opts.query,
    spaceId: opts.spaceId,
    maxPages: opts.maxPages,
    owner: opts.owner,
    folder: opts.folder,
    driveFolder: opts.driveFolder,
  });

  const { nodes } = collectResult;

  if (nodes.length === 0) {
    console.log(chalk.yellow('未找到任何文档。请检查搜索关键词或 lark-cli 登录状态。'));
    process.exit(0);
  }

  // Save nodes WITH content for Claude-direct analysis
  await cache.writeNodes(nodes);
  await cache.writeMeta({
    version: '0.2.0',
    scanned_at: new Date().toISOString(),
    mode: opts.mode,
    query: opts.query,
    space_id: collectResult.spaceId,
    space_name: collectResult.spaceName,
    node_count: nodes.length,
  });

  console.log(chalk.green(`\n✓ 收集完成，${nodes.length} 篇文档已缓存（含内容）`));

  // Show document preview + next step guidance
  console.log('');
  console.log(chalk.bold('📋 文档预览：'));
  const preview = nodes.slice(0, 5);
  for (const n of preview) {
    const chars = n.content?.length ?? 0;
    console.log(chalk.gray(`  · ${n.title} (${chars > 0 ? chars + '字' : '无内容'})`));
  }
  if (nodes.length > 5) {
    console.log(chalk.gray(`  ... 还有 ${nodes.length - 5} 篇`));
  }

  const cachePath = join(process.cwd(), '.knowledge-cache');
  console.log('');
  console.log(chalk.bold('💡 下一步：'));
  console.log(chalk.cyan('  方式 A — 把以下提示词发给你的 AI 助手（Claude / Codex / ChatGPT）：'));
  console.log(chalk.white(`  "请读取 ${cachePath}/nodes.json，按主题对这些文档进行语义聚类，`));
  console.log(chalk.white(`   找出碰撞洞察，然后将结果写入 ${cachePath}/ 下的缓存文件。`));
  console.log(chalk.white(`   完成后运行 npx knowledge-explorer --render-only 生成报告"`));
  console.log('');
  console.log(chalk.cyan('  方式 B — 配置 API key 后全自动分析：'));
  console.log(chalk.white(`  echo "OPENAI_API_KEY=sk-xxx" > .env`));
  console.log(chalk.white(`  npx knowledge-explorer --analyze-only`));
  console.log('');
  console.log(chalk.gray(`  或运行 npx knowledge-explorer --analyze-prompt 获取完整分析提示词`));

  return collectResult;
}

async function runAnalyze(cache: CacheStore) {
  // Read nodes from cache (must have content from collect phase)
  const nodes = await cache.readNodes();
  if (nodes.length === 0) {
    console.log(chalk.yellow('缓存中无文档，请先运行 --collect-only'));
    process.exit(1);
  }

  // Init AI — hard-fail if no key configured
  initAIFromEnv();
  if (!isAIConfigured()) {
    console.error(chalk.red('❌ --analyze-only 需要 AI API key。请在 .env 中配置 OPENAI_API_KEY 或使用 Path A（Coding Agent）模式。'));
    process.exit(1);
  }

  // Phase 2: Build Graph
  const { edges, clusters } = await buildGraph(nodes, cache);
  await cache.writeEdges(edges);
  await cache.writeClusters(clusters);

  // Phase 3: Insights
  const structural = computeStructuralInsights(nodes, edges, clusters);
  const semantic = await computeSemanticInsights(nodes, clusters);
  const collisions = await computeCollisionInsights(nodes, edges, clusters);

  // Persist insights for render-only mode
  await cache.writeStructuralInsights(structural);
  await cache.writeSemanticInsights(semantic);
  await cache.writeCollisionInsights(collisions);

  // Strip content and re-save nodes (save space)
  await cache.writeNodes(nodes.map(n => ({ ...n, content: undefined })));

  console.log(chalk.green(`\n✓ 分析完成，结果已缓存`));
  return { nodes, edges, clusters, structural, semantic, collisions };
}

async function runRender(cache: CacheStore) {
  // Read all results from cache
  const nodes = await cache.readNodes();
  const edges = await cache.readEdges();
  const clusters = await cache.readClusters();
  const meta = await cache.readMeta();

  if (nodes.length === 0) {
    console.log(chalk.yellow('缓存中无数据，请先运行收集和分析'));
    process.exit(1);
  }

  // Restore summaries into nodes
  const summaries = await cache.readSummaries();
  for (const node of nodes) {
    if (!node.summary && summaries.has(node.id)) {
      const s = summaries.get(node.id)!;
      node.summary = s.summary;
      node.keywords = s.keywords;
    }
  }

  // Read insights — if not cached, recompute structural (no AI needed)
  let structural = await cache.readStructuralInsights();
  if (structural.length === 0 && edges.length > 0) {
    structural = computeStructuralInsights(nodes, edges, clusters);
  }
  const semantic = await cache.readSemanticInsights();
  const collisions = await cache.readCollisionInsights();

  const result: ExploreResult = {
    nodes,
    edges,
    clusters,
    structural_insights: structural,
    semantic_insights: semantic,
    collision_insights: collisions,
    scanned_at: meta?.scanned_at ?? new Date().toISOString(),
  };

  printTerminalReport(result);
  await publishToFeishu(result);
}

// --- Full pipeline (default, backward compatible) ---

async function exploreFull(cache: CacheStore, opts: {
  mode: 'full-scan' | 'keyword-search' | 'drive-scan';
  query?: string;
  spaceId?: string;
  maxPages?: number;
  owner?: string;
  folder?: string;
  driveFolder?: string;
}) {
  // Init AI — if no key, gracefully degrade to collect-only + guidance
  initAIFromEnv();

  // Phase 1: Collect (reuse runCollect)
  await runCollect(cache, opts);

  // No API key → already printed guidance in runCollect style, show degradation note
  if (!isAIConfigured()) {
    console.log('');
    console.log(chalk.yellow('⚠ 未检测到 AI API key，已自动切换为收集模式'));
    console.log('');
    console.log(chalk.bold('💡 下一步：'));
    console.log(chalk.cyan('  方式 A — 运行以下命令获取完整分析提示词，粘贴给你的 AI 助手：'));
    console.log(chalk.white('  npx knowledge-explorer --analyze-prompt'));
    console.log('');
    console.log(chalk.cyan('  方式 B — 配置 API key 后重新运行：'));
    console.log(chalk.white('  echo "OPENAI_API_KEY=sk-xxx" > .env'));
    console.log(chalk.white('  npx knowledge-explorer'));
    return;
  }

  // Phase 2+3: Analyze (reuse runAnalyze)
  await runAnalyze(cache);

  // Phase 4: Render (reuse runRender)
  await runRender(cache);

  console.log(chalk.bold.cyan('\n✨ 探索完成\n'));
}

// --- CLI Argument Parsing ---

const args = process.argv.slice(2);

// --analyze-prompt: generate a copy-paste prompt for AI analysis
if (args.includes('--analyze-prompt')) {
  (async () => {
    const cacheDir = join(process.cwd(), '.knowledge-cache');
    const cache = new CacheStore(cacheDir);
    const nodes = await cache.readNodes();

    if (nodes.length === 0) {
      console.log(chalk.yellow('缓存中无文档，请先运行 --collect-only'));
      process.exit(1);
    }

    // Build compact document list (title + summary/keywords if available, truncated content)
    const docList = nodes.map((n, i) => {
      const parts = [`${i + 1}. 「${n.title}」`];
      if (n.summary) parts.push(`   摘要：${n.summary}`);
      if (n.keywords?.length) parts.push(`   关键词：${n.keywords.join('、')}`);
      if (n.content) {
        const preview = n.content.slice(0, 300).replace(/\n/g, ' ');
        parts.push(`   内容摘录：${preview}${n.content.length > 300 ? '...' : ''}`);
      }
      return parts.join('\n');
    }).join('\n\n');

    const prompt = `你是一个知识图谱分析专家。我有 ${nodes.length} 篇飞书文档，请帮我分析它们之间的关系。

## 文档列表

${docList}

## 你的任务

请依次完成以下分析，每步完成后告诉我进度：

### 1. 语义聚类
将这些文档按主题分为 ${Math.ceil(nodes.length / 4)} ~ ${Math.ceil(nodes.length / 2)} 组，每组不超过 5 篇。给每组一个 2-6 字的主题标签。

### 2. 碰撞洞察
从不同聚类中挑 3-5 对文档，发现它们的潜在交叉点，生成**具体可执行的行动建议**（不要泛泛而谈）。

### 3. 知识健康度
识别：
- 枢纽文档（被多篇关联的核心文档）
- 孤岛文档（与其他文档无关联）
- 过期文档（长期未更新但仍被引用）

### 4. 输出结果
将分析结果写入 ${cacheDir}/ 目录下的 JSON 文件：
- summaries.json — 每篇文档的摘要和关键词
- clusters.json — 聚类结果：[{"id":"cluster_0","label":"主题标签","node_ids":["doc_id"],"summary":"描述"}]
- edges.json — 关系边：[{"source":"id1","target":"id2","type":"semantic","weight":0.8,"reason":"原因"}]
- structural_insights.json — [{"type":"hub|orphan|stale","node_ids":["id"],"description":"描述"}]
- semantic_insights.json — [{"cluster_id":"cluster_0","themes":[],"contradictions":[],"duplicates":[],"summary":""}]
- collision_insights.json — [{"node_a_id":"id1","node_b_id":"id2","suggestion":"建议","reasoning":"原因"}]

写完后运行：npx knowledge-explorer --render-only`;

    console.log(prompt);
  })().catch(err => {
    console.error(chalk.red(`\n❌ 错误: ${err.message}`));
    process.exit(1);
  });
// --list-spaces: utility mode
} else if (args.includes('--list-spaces')) {
  (async () => {
    const spaces = await listSpaces();
    if (spaces.length === 0) {
      console.log('未找到知识空间。');
    } else {
      console.log(`找到 ${spaces.length} 个知识空间:\n`);
      for (const s of spaces) {
        console.log(`  ${s.name}  (ID: ${s.space_id})`);
        if (s.description) console.log(`    ${s.description}`);
      }
    }
  })().catch(err => {
    console.error(chalk.red(`\n❌ 错误: ${err.message}`));
    process.exit(1);
  });
// --list-tree <spaceId>: show folder tree of a space
} else if (args.includes('--list-tree')) {
  const idx = args.indexOf('--list-tree');
  const targetSpaceId = args[idx + 1];
  if (!targetSpaceId) {
    console.error(chalk.red('用法: knowledge-explorer --list-tree <space_id>'));
    process.exit(1);
  }
  (async () => {
    const nodes = await listAllSpaceNodes(targetSpaceId);
    if (nodes.length === 0) {
      console.log('该空间下没有节点。');
      return;
    }

    // Build parent→children map for tree display
    const childrenMap = new Map<string, typeof nodes>();
    const rootNodes: typeof nodes = [];
    for (const n of nodes) {
      if (!n.parent_node_token) {
        rootNodes.push(n);
      } else {
        const siblings = childrenMap.get(n.parent_node_token) ?? [];
        siblings.push(n);
        childrenMap.set(n.parent_node_token, siblings);
      }
    }

    const typeIcons: Record<string, string> = {
      docx: '📄', doc: '📄', sheet: '📊', bitable: '📋',
      slides: '📽️', mindnote: '🧠', file: '📎',
    };

    function printTree(nodeList: typeof nodes, prefix: string) {
      for (let i = 0; i < nodeList.length; i++) {
        const n = nodeList[i];
        const isLast = i === nodeList.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const icon = typeIcons[n.obj_type] ?? (n.has_child ? '📁' : '📄');
        console.log(`${prefix}${connector}${icon} ${n.title}  ${chalk.gray(n.node_token)}`);
        const children = childrenMap.get(n.node_token);
        if (children) {
          printTree(children, prefix + (isLast ? '    ' : '│   '));
        }
      }
    }

    console.log(`\n知识空间节点树 (共 ${nodes.length} 个节点):\n`);
    printTree(rootNodes, '');
    console.log(chalk.gray('\n提示: 使用 --folder <node_token> 可只探索某个子树'));
  })().catch(err => {
    console.error(chalk.red(`\n❌ 错误: ${err.message}`));
    process.exit(1);
  });
// --list-drive [folder_token]: show Drive folder tree
} else if (args.includes('--list-drive')) {
  const idx = args.indexOf('--list-drive');
  const targetFolder = args[idx + 1] && !args[idx + 1].startsWith('-') ? args[idx + 1] : undefined;
  (async () => {
    let rootToken: string;
    if (targetFolder) {
      rootToken = targetFolder;
      console.log(chalk.blue(`📂 显示云盘文件夹: ${targetFolder}\n`));
    } else {
      console.log(chalk.blue('📡 正在获取云盘根目录...\n'));
      rootToken = getRootFolderToken();
    }

    const allFiles = listAllDriveFiles(rootToken);
    if (allFiles.length === 0) {
      console.log('该文件夹下没有内容。');
      return;
    }

    // Build parent→children map for tree display
    const childrenMap = new Map<string, typeof allFiles>();
    const rootFiles = allFiles.filter(f => f.parent_token === rootToken);
    for (const f of allFiles) {
      if (f.parent_token !== rootToken) {
        const siblings = childrenMap.get(f.parent_token) ?? [];
        siblings.push(f);
        childrenMap.set(f.parent_token, siblings);
      }
    }

    const typeIcons: Record<string, string> = {
      docx: '📄', doc: '📄', sheet: '📊', bitable: '📋',
      slides: '📽️', mindnote: '🧠', file: '📎', folder: '📁',
    };

    function printTree(fileList: typeof allFiles, prefix: string) {
      for (let i = 0; i < fileList.length; i++) {
        const f = fileList[i];
        const isLast = i === fileList.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const icon = typeIcons[f.type] ?? '📄';
        console.log(`${prefix}${connector}${icon} ${f.name}  ${chalk.gray(f.token)}`);
        const children = childrenMap.get(f.token);
        if (children) {
          printTree(children, prefix + (isLast ? '    ' : '│   '));
        }
      }
    }

    const docCount = allFiles.filter(f => f.type === 'docx' || f.type === 'doc').length;
    console.log(`云盘文件树 (共 ${allFiles.length} 项, ${docCount} 篇可分析文档):\n`);
    printTree(rootFiles, '');
    console.log(chalk.gray('\n提示: 使用 --drive <folder_token> 可扫描指定文件夹'));
  })().catch(err => {
    console.error(chalk.red(`\n❌ 错误: ${err.message}`));
    process.exit(1);
  });
} else {
  // Parse flags
  const collectOnly = args.includes('--collect-only');
  const analyzeOnly = args.includes('--analyze-only');
  const renderOnly = args.includes('--render-only');

  const queryIdx = args.indexOf('--query');
  const spaceIdx = args.indexOf('--space');
  const maxPagesIdx = args.indexOf('--max-pages');
  const ownerIdx = args.indexOf('--owner');
  const folderIdx = args.indexOf('--folder');
  const driveIdx = args.indexOf('--drive');

  const flagValues = new Set([queryIdx + 1, spaceIdx + 1, maxPagesIdx + 1, ownerIdx + 1, folderIdx + 1, driveIdx + 1]);
  const bareArg = args.find((a, i) => !a.startsWith('-') && !flagValues.has(i));

  const query = queryIdx !== -1 ? args[queryIdx + 1] : bareArg;
  const spaceId = spaceIdx !== -1 ? args[spaceIdx + 1] : undefined;
  const maxPages = maxPagesIdx !== -1 ? parseInt(args[maxPagesIdx + 1], 10) : undefined;
  const owner = ownerIdx !== -1 ? args[ownerIdx + 1] : undefined;
  const folder = folderIdx !== -1 ? args[folderIdx + 1] : undefined;

  // --drive [folder_token]: scan Drive instead of Wiki
  const isDrive = driveIdx !== -1;
  const driveFolder = isDrive && args[driveIdx + 1] && !args[driveIdx + 1].startsWith('-')
    ? args[driveIdx + 1] : undefined;

  // Validate: --drive conflicts with --space and --query
  if (isDrive && spaceId) {
    console.error(chalk.red('❌ --drive 和 --space 不能同时使用。--drive 扫描云盘，--space 扫描知识空间。'));
    process.exit(1);
  }
  if (isDrive && query) {
    console.error(chalk.red('❌ --drive 和 --query 不能同时使用。云盘模式直接遍历文件夹。'));
    process.exit(1);
  }

  const mode = isDrive ? 'drive-scan' as const : query ? 'keyword-search' as const : 'full-scan' as const;

  const cacheDir = join(process.cwd(), '.knowledge-cache');
  const cache = new CacheStore(cacheDir);

  const run = async () => {
    console.log(chalk.bold.cyan('\n🔍 Knowledge Explorer — 飞书知识探索器\n'));

    if (collectOnly) {
      await runCollect(cache, { mode, query, spaceId, maxPages, owner, folder, driveFolder });
    } else if (analyzeOnly) {
      await runAnalyze(cache);
    } else if (renderOnly) {
      await runRender(cache);
    } else {
      // Default: full pipeline
      await exploreFull(cache, { mode, query, spaceId, maxPages, owner, folder, driveFolder });
    }
  };

  run().catch(err => {
    console.error(chalk.red(`\n❌ 错误: ${err.message}`));
    process.exit(1);
  });
}
