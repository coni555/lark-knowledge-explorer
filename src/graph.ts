// src/graph.ts
import type { KnowledgeNode, Edge, Cluster } from './types.js';
import { summarizeDoc, batchCluster, isAIConfigured } from './ai.js';
import type { CacheStore } from './cache.js';
import chalk from 'chalk';

// --- AI Summaries (with cache) ---

export async function generateSummaries(nodes: KnowledgeNode[], cache?: CacheStore): Promise<void> {
  // Load summary cache
  const summaryCache = cache ? await cache.readSummaries() : new Map();

  // Restore cached summaries first
  for (const node of nodes) {
    if (!node.summary && summaryCache.has(node.id)) {
      const cached = summaryCache.get(node.id)!;
      if (cached.updated_at === node.updated_at) {
        node.summary = cached.summary;
        node.keywords = cached.keywords;
      }
    }
  }

  const needSummary = nodes.filter(n => !n.summary && n.content);
  if (needSummary.length === 0) return;

  if (!isAIConfigured()) {
    console.log(chalk.yellow('   ⏭ 跳过摘要生成（未配置 AI API key）'));
    return;
  }

  console.log(chalk.blue(`🤖 正在生成 ${needSummary.length} 篇文档的 AI 摘要...`));
  let done = 0;

  for (const node of needSummary) {
    try {
      const result = await summarizeDoc(node.title, node.content!);
      node.summary = result.summary;
      node.keywords = result.keywords;
      // Update summary cache
      summaryCache.set(node.id, {
        summary: result.summary,
        keywords: result.keywords,
        updated_at: node.updated_at,
      });
      done++;
      process.stdout.write(chalk.gray(`\r   已完成 ${done}/${needSummary.length}`));
    } catch (err) {
      console.warn(chalk.yellow(`\n   ⚠ 摘要生成失败: ${node.title}`));
    }
  }

  // Persist summary cache
  if (cache) await cache.writeSummaries(summaryCache);
  console.log(chalk.green(`\n   ✓ 摘要生成完成`));
}

// --- Semantic Clustering (AI batch, primary) ---

async function buildSemanticClusters(nodes: KnowledgeNode[]): Promise<{ clusters: Cluster[]; edges: Edge[] }> {
  const docsWithSummary = nodes.filter(n => n.summary && n.keywords?.length > 0);

  if (docsWithSummary.length < 2 || !isAIConfigured()) {
    // Fallback: single cluster with all nodes
    return {
      clusters: [{ id: 'cluster_0', label: '全部文档', node_ids: nodes.map(n => n.id) }],
      edges: [],
    };
  }

  console.log(chalk.blue(`🧠 正在进行 AI 语义聚类（${docsWithSummary.length} 篇文档）...`));

  const aiClusters = await batchCluster(
    docsWithSummary.map(n => ({ id: n.id, title: n.title, summary: n.summary, keywords: n.keywords }))
  );

  // Convert to Cluster objects
  const clusters: Cluster[] = [];
  const edges: Edge[] = [];
  const clusteredIds = new Set<string>();

  for (let i = 0; i < aiClusters.length; i++) {
    const ac = aiClusters[i];
    // Filter to only valid node IDs
    const validIds = ac.doc_ids.filter(id => docsWithSummary.some(n => n.id === id));
    if (validIds.length === 0) continue;

    validIds.forEach(id => clusteredIds.add(id));

    clusters.push({
      id: `cluster_${i}`,
      label: ac.cluster_label,
      node_ids: validIds,
    });

    // Create intra-cluster semantic edges
    if (validIds.length <= 8) {
      // Small cluster: connect all pairs
      for (let a = 0; a < validIds.length; a++) {
        for (let b = a + 1; b < validIds.length; b++) {
          edges.push({
            source: validIds[a],
            target: validIds[b],
            type: 'semantic',
            weight: 0.8,
            reason: ac.cluster_label,
          });
        }
      }
    } else {
      // Large cluster: connect each doc to 3 nearest by keyword overlap
      const clusterNodes = validIds.map(id => docsWithSummary.find(n => n.id === id)!);
      for (const node of clusterNodes) {
        const others = clusterNodes
          .filter(o => o.id !== node.id)
          .map(o => ({
            id: o.id,
            overlap: node.keywords.filter(k => o.keywords.includes(k)).length,
          }))
          .sort((a, b) => b.overlap - a.overlap)
          .slice(0, 3);

        for (const o of others) {
          // Avoid duplicate edges
          const exists = edges.some(e =>
            (e.source === node.id && e.target === o.id) ||
            (e.source === o.id && e.target === node.id)
          );
          if (!exists) {
            edges.push({
              source: node.id,
              target: o.id,
              type: 'semantic',
              weight: 0.8,
              reason: ac.cluster_label,
            });
          }
        }
      }
    }
  }

  // Handle unclustered nodes (put in "其他" cluster)
  const unclustered = nodes.filter(n => !clusteredIds.has(n.id));
  if (unclustered.length > 0) {
    clusters.push({
      id: `cluster_${clusters.length}`,
      label: '其他',
      node_ids: unclustered.map(n => n.id),
    });
  }

  console.log(chalk.green(`   ✓ AI 聚类完成: ${clusters.length} 个主题, ${edges.length} 条语义边`));
  return { clusters, edges };
}

// --- Bonus: Link & Mention Edges (supplementary) ---

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

export function findMentionEdges(nodes: KnowledgeNode[]): Edge[] {
  const edges: Edge[] = [];
  const seen = new Set<string>();

  for (const source of nodes) {
    if (!source.content) continue;
    for (const target of nodes) {
      if (source.id === target.id) continue;
      if (target.title.length < 2) continue;
      if (source.content.includes(target.title)) {
        const key = `${source.id}->${target.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({ source: source.id, target: target.id, type: 'mention', weight: 0.6 });
        }
      }
    }
  }

  return edges;
}

// --- Full graph build pipeline ---

export async function buildGraph(nodes: KnowledgeNode[], cache?: CacheStore): Promise<{ edges: Edge[]; clusters: Cluster[] }> {
  console.log(chalk.blue('🔗 正在构建知识图谱...'));

  // Step 1: AI summaries (with cache)
  await generateSummaries(nodes, cache);

  // Step 2: AI semantic clustering (PRIMARY)
  const { clusters, edges: semanticEdges } = await buildSemanticClusters(nodes);

  // Step 3: Bonus link/mention edges (supplementary)
  const linkEdges = findLinkEdges(nodes);
  const mentionEdges = findMentionEdges(nodes);
  if (linkEdges.length > 0) console.log(chalk.gray(`   额外发现 ${linkEdges.length} 条链接关系`));
  if (mentionEdges.length > 0) console.log(chalk.gray(`   额外发现 ${mentionEdges.length} 条提及关系`));

  // Step 4: Merge all edges
  const allEdges = [...semanticEdges, ...linkEdges, ...mentionEdges];
  console.log(chalk.green(`   ✓ 图谱构建完成: ${allEdges.length} 条边, ${clusters.length} 个聚类`));

  return { edges: allEdges, clusters };
}
