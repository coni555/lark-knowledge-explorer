#!/usr/bin/env node
// src/index.ts
import { CacheStore } from './cache.js';
import { collectDocuments, type CollectOptions } from './collect.js';
import { buildGraph } from './graph.js';
import { computeStructuralInsights, computeSemanticInsights, computeCollisionInsights } from './insights.js';
import { printTerminalReport, publishToFeishu } from './output.js';
import { initAIFromEnv } from './ai.js';
import { listSpaces } from './lark.js';
import type { ExploreResult } from './types.js';
import chalk from 'chalk';
import { join } from 'path';

// --- Phase runners ---

async function runCollect(cache: CacheStore, opts: {
  mode: 'full-scan' | 'keyword-search';
  query?: string;
  spaceId?: string;
  maxPages?: number;
  owner?: string;
}) {
  const collectResult = await collectDocuments(cache, {
    mode: opts.mode,
    query: opts.query,
    spaceId: opts.spaceId,
    maxPages: opts.maxPages,
    owner: opts.owner,
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
  return collectResult;
}

async function runAnalyze(cache: CacheStore) {
  // Read nodes from cache (must have content from collect phase)
  const nodes = await cache.readNodes();
  if (nodes.length === 0) {
    console.log(chalk.yellow('缓存中无文档，请先运行 --collect-only'));
    process.exit(1);
  }

  // Init AI
  initAIFromEnv();

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
  mode: 'full-scan' | 'keyword-search';
  query?: string;
  spaceId?: string;
  maxPages?: number;
  owner?: string;
}) {

  // Init AI
  initAIFromEnv();

  // Phase 1: Collect
  const collectResult = await collectDocuments(cache, {
    mode: opts.mode,
    query: opts.query,
    spaceId: opts.spaceId,
    maxPages: opts.maxPages,
    owner: opts.owner,
  });

  const { nodes } = collectResult;

  if (nodes.length === 0) {
    console.log(chalk.yellow('未找到任何文档。请检查搜索关键词或 lark-cli 登录状态。'));
    process.exit(0);
  }

  // Phase 2: Build Graph
  const { edges, clusters } = await buildGraph(nodes, cache);
  await cache.writeEdges(edges);
  await cache.writeClusters(clusters);

  // Phase 3: Insights
  const structural = computeStructuralInsights(nodes, edges, clusters);
  const semantic = await computeSemanticInsights(nodes, clusters);
  const collisions = await computeCollisionInsights(nodes, edges, clusters);

  // Persist insights
  await cache.writeStructuralInsights(structural);
  await cache.writeSemanticInsights(semantic);
  await cache.writeCollisionInsights(collisions);

  // Save nodes (strip content)
  await cache.writeNodes(nodes.map(n => ({ ...n, content: undefined })));
  await cache.writeMeta({
    version: '0.2.0',
    scanned_at: new Date().toISOString(),
    mode: opts.mode,
    query: opts.query,
    space_id: collectResult.spaceId,
    space_name: collectResult.spaceName,
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

// --- CLI Argument Parsing ---

const args = process.argv.slice(2);

// --list-spaces: utility mode
if (args.includes('--list-spaces')) {
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
} else {
  // Parse flags
  const collectOnly = args.includes('--collect-only');
  const analyzeOnly = args.includes('--analyze-only');
  const renderOnly = args.includes('--render-only');

  const queryIdx = args.indexOf('--query');
  const spaceIdx = args.indexOf('--space');
  const maxPagesIdx = args.indexOf('--max-pages');
  const ownerIdx = args.indexOf('--owner');

  const flagValues = new Set([queryIdx + 1, spaceIdx + 1, maxPagesIdx + 1, ownerIdx + 1]);
  const bareArg = args.find((a, i) => !a.startsWith('-') && !flagValues.has(i));

  const query = queryIdx !== -1 ? args[queryIdx + 1] : bareArg;
  const spaceId = spaceIdx !== -1 ? args[spaceIdx + 1] : undefined;
  const maxPages = maxPagesIdx !== -1 ? parseInt(args[maxPagesIdx + 1], 10) : undefined;
  const owner = ownerIdx !== -1 ? args[ownerIdx + 1] : undefined;
  const mode = query ? 'keyword-search' as const : 'full-scan' as const;

  const cacheDir = join(process.cwd(), '.knowledge-cache');
  const cache = new CacheStore(cacheDir);

  const run = async () => {
    console.log(chalk.bold.cyan('\n🔍 Knowledge Explorer — 飞书知识探索器\n'));

    if (collectOnly) {
      await runCollect(cache, { mode, query, spaceId, maxPages, owner });
    } else if (analyzeOnly) {
      await runAnalyze(cache);
    } else if (renderOnly) {
      await runRender(cache);
    } else {
      // Default: full pipeline
      await exploreFull(cache, { mode, query, spaceId, maxPages, owner });
    }
  };

  run().catch(err => {
    console.error(chalk.red(`\n❌ 错误: ${err.message}`));
    process.exit(1);
  });
}
