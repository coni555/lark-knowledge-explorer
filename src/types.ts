// === Data Model ===

export interface KnowledgeNode {
  id: string;                    // wiki node token or doc token
  type: 'wiki' | 'doc' | 'drive' | 'minutes';
  title: string;
  space: string;                 // space name or id
  owner?: string;                // owner name
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
  mode: 'full-scan' | 'keyword-search' | 'drive-scan';
  query?: string;
  space_id?: string;
  space_name?: string;
  node_count: number;
}
