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

  // Separate degree counts by edge type
  // link/mention = "real references", semantic = "algorithmic connections"
  const refInDegree = new Map<string, number>();   // link + mention
  const semInDegree = new Map<string, number>();    // semantic only
  const totalDegree = new Map<string, number>();    // all types combined
  for (const n of nodes) {
    refInDegree.set(n.id, 0);
    semInDegree.set(n.id, 0);
    totalDegree.set(n.id, 0);
  }
  for (const e of edges) {
    totalDegree.set(e.target, (totalDegree.get(e.target) ?? 0) + 1);
    if (e.type === 'link' || e.type === 'mention') {
      refInDegree.set(e.target, (refInDegree.get(e.target) ?? 0) + 1);
    } else {
      semInDegree.set(e.target, (semInDegree.get(e.target) ?? 0) + 1);
    }
  }

  // Weighted score: link/mention count as 1.0, semantic as 0.3
  function weightedScore(nodeId: string): number {
    return (refInDegree.get(nodeId) ?? 0) + (semInDegree.get(nodeId) ?? 0) * 0.3;
  }

  // Hub description: distinguish "引用" (real refs) from "关联" (semantic)
  function hubDescription(n: KnowledgeNode): string {
    const refs = refInDegree.get(n.id) ?? 0;
    const sems = semInDegree.get(n.id) ?? 0;
    if (refs > 0 && sems > 0) return `《${n.title}》被 ${refs} 篇引用、与 ${sems} 篇语义关联`;
    if (refs > 0) return `《${n.title}》被 ${refs} 篇文档引用`;
    return `《${n.title}》与 ${sems} 篇文档语义关联`;
  }

  // Hubs: weighted score >= 1.5 (≈2 real refs, or 5 semantic edges)
  const hubThreshold = 1.5;
  const hubs = nodes
    .filter(n => weightedScore(n.id) >= hubThreshold)
    .sort((a, b) => weightedScore(b.id) - weightedScore(a.id));

  if (hubs.length > 0) {
    insights.push({
      type: 'hub',
      node_ids: hubs.map(n => n.id),
      description: hubs.map(n => hubDescription(n)).join('；'),
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

  // Stale: referenced docs (>30 days without update)
  // Prioritize real references; fall back to weighted score
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const staleNodes = nodes.filter(n => {
    const age = now - new Date(n.updated_at).getTime();
    return age > thirtyDays && weightedScore(n.id) >= 1.5;
  });
  if (staleNodes.length > 0) {
    insights.push({
      type: 'stale',
      node_ids: staleNodes.map(n => n.id),
      description: staleNodes.map(n => {
        const days = Math.floor((now - new Date(n.updated_at).getTime()) / (24 * 60 * 60 * 1000));
        const refs = refInDegree.get(n.id) ?? 0;
        const sems = semInDegree.get(n.id) ?? 0;
        const refPart = refs > 0 ? `被 ${refs} 篇引用` : `与 ${sems} 篇语义关联`;
        return `《${n.title}》${days}天未更新，${refPart}`;
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

  // Keyword similarity: exact match + substring match
  function keywordSimilarity(kwA: string[], kwB: string[]): number {
    const exact = kwA.filter(k => kwB.includes(k)).length;
    if (exact > 0) return exact * 2;
    let partial = 0;
    for (const a of kwA) {
      for (const b of kwB) {
        if (a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a))) {
          partial++;
        }
      }
    }
    return partial;
  }

  // Find candidate pairs
  interface Candidate { a: KnowledgeNode; b: KnowledgeNode; score: number }
  const candidates: Candidate[] = [];
  const clusterCount = new Set([...nodeCluster.values()]).size;
  const requireDiffCluster = clusterCount > 2;

  const nodesWithKeywords = nodes.filter(n => n.keywords.length > 0 && n.summary);
  for (let i = 0; i < nodesWithKeywords.length; i++) {
    for (let j = i + 1; j < nodesWithKeywords.length; j++) {
      const a = nodesWithKeywords[i];
      const b = nodesWithKeywords[j];

      // Different cluster (skip check when ≤2 clusters)
      if (requireDiffCluster && nodeCluster.get(a.id) === nodeCluster.get(b.id)) continue;

      // No direct edge
      if (directPairs.has(`${a.id}:${b.id}`)) continue;

      const score = keywordSimilarity(a.keywords, b.keywords);
      if (score > 0) {
        candidates.push({ a, b, score });
      }
    }
  }

  // Fallback: random cross-cluster sampling when too few candidates
  if (candidates.length < 3 && nodesWithKeywords.length >= 4) {
    const existing = new Set(candidates.map(c => `${c.a.id}:${c.b.id}`));
    for (let attempt = 0; attempt < 20 && candidates.length < 5; attempt++) {
      const i = Math.floor(Math.random() * nodesWithKeywords.length);
      const j = Math.floor(Math.random() * nodesWithKeywords.length);
      if (i === j) continue;
      const a = nodesWithKeywords[i];
      const b = nodesWithKeywords[j];
      const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
      if (existing.has(key) || directPairs.has(`${a.id}:${b.id}`)) continue;
      existing.add(key);
      candidates.push({ a, b, score: 0.1 });
    }
  }

  // Sort by score, take top 5
  candidates.sort((x, y) => y.score - x.score);
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
