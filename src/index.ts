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

interface ExploreOptions {
  mode: 'full-scan' | 'keyword-search';
  query?: string;
  spaceId?: string;
  maxPages?: number;
  owner?: string;
}

async function explore(opts: ExploreOptions) {
  console.log(chalk.bold.cyan('\n🔍 Knowledge Explorer — 飞书知识探索器\n'));

  // Init AI
  initAIFromEnv();

  // Init cache
  const cacheDir = join(process.cwd(), '.knowledge-cache');
  const cache = new CacheStore(cacheDir);

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

  // Phase 2: Build Graph (semantic-first)
  const { edges, clusters } = await buildGraph(nodes, cache);
  await cache.writeEdges(edges);
  await cache.writeClusters(clusters);

  // Phase 3: Insights
  const structural = computeStructuralInsights(nodes, edges, clusters);
  const semantic = await computeSemanticInsights(nodes, clusters);
  const collisions = await computeCollisionInsights(nodes, edges, clusters);

  // Save final node state (strip content to reduce cache size)
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
  // Determine mode
  const queryIdx = args.indexOf('--query');
  const spaceIdx = args.indexOf('--space');
  const maxPagesIdx = args.indexOf('--max-pages');
  const ownerIdx = args.indexOf('--owner');

  // Legacy: bare argument treated as --query for backwards compatibility
  const flagValues = new Set([queryIdx + 1, spaceIdx + 1, maxPagesIdx + 1, ownerIdx + 1]);
  const bareArg = args.find((a, i) => !a.startsWith('-') && !flagValues.has(i));

  const query = queryIdx !== -1 ? args[queryIdx + 1] : bareArg;
  const spaceId = spaceIdx !== -1 ? args[spaceIdx + 1] : undefined;
  const maxPages = maxPagesIdx !== -1 ? parseInt(args[maxPagesIdx + 1], 10) : undefined;
  const owner = ownerIdx !== -1 ? args[ownerIdx + 1] : undefined;

  const mode = query ? 'keyword-search' : 'full-scan';

  explore({ mode, query, spaceId, maxPages, owner }).catch(err => {
    console.error(chalk.red(`\n❌ 错误: ${err.message}`));
    process.exit(1);
  });
}
