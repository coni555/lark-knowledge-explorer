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
