// src/cache.ts
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { KnowledgeNode, Edge, Cluster, CacheMeta, StructuralInsight, SemanticInsight, CollisionInsight } from './types.js';

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

  // Summaries cache (keyed by id, avoids re-summarizing unchanged docs)
  async readSummaries(): Promise<Map<string, { summary: string; keywords: string[]; updated_at: string }>> {
    const arr = await this.readJSON<Array<{ id: string; summary: string; keywords: string[]; updated_at: string }>>('summaries.json');
    if (!arr) return new Map();
    return new Map(arr.map(s => [s.id, s]));
  }

  async writeSummaries(map: Map<string, { summary: string; keywords: string[]; updated_at: string }>) {
    const arr = [...map.entries()].map(([id, v]) => ({ id, ...v }));
    await this.writeJSON('summaries.json', arr);
  }

  // Structural insights
  async readStructuralInsights(): Promise<StructuralInsight[]> {
    return (await this.readJSON<StructuralInsight[]>('structural_insights.json')) ?? [];
  }
  async writeStructuralInsights(insights: StructuralInsight[]) {
    await this.writeJSON('structural_insights.json', insights);
  }

  // Semantic insights
  async readSemanticInsights(): Promise<SemanticInsight[]> {
    return (await this.readJSON<SemanticInsight[]>('semantic_insights.json')) ?? [];
  }
  async writeSemanticInsights(insights: SemanticInsight[]) {
    await this.writeJSON('semantic_insights.json', insights);
  }

  // Collision insights
  async readCollisionInsights(): Promise<CollisionInsight[]> {
    return (await this.readJSON<CollisionInsight[]>('collision_insights.json')) ?? [];
  }
  async writeCollisionInsights(insights: CollisionInsight[]) {
    await this.writeJSON('collision_insights.json', insights);
  }

  // Freshness: node is fresh if fetched_at >= updated_at
  isNodeFresh(node: KnowledgeNode): boolean {
    if (!node.fetched_at || !node.updated_at) return false;
    return new Date(node.fetched_at) >= new Date(node.updated_at);
  }
}
