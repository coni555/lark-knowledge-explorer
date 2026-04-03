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
