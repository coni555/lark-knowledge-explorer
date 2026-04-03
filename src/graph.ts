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
