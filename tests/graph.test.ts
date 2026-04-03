// tests/graph.test.ts
import { describe, it, expect } from 'vitest';
import { findLinkEdges, findMentionEdges, clusterNodes } from '../src/graph.js';
import type { KnowledgeNode, Edge } from '../src/types.js';

function makeNode(id: string, title: string, content = '', keywords: string[] = []): KnowledgeNode {
  return {
    id, type: 'doc', title, space: '', url: `https://test.feishu.cn/docx/${id}`,
    updated_at: '', summary: '', keywords, word_count: content.length,
    fetched_at: '', content,
  };
}

describe('findLinkEdges', () => {
  it('detects feishu links in content', () => {
    const nodes = [
      makeNode('aaa', 'Doc A', 'See [related](https://test.feishu.cn/docx/bbb) for details'),
      makeNode('bbb', 'Doc B', 'No links here'),
    ];
    const edges = findLinkEdges(nodes);
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('aaa');
    expect(edges[0].target).toBe('bbb');
    expect(edges[0].type).toBe('link');
  });
});

describe('findMentionEdges', () => {
  it('detects title mentions in other docs', () => {
    const nodes = [
      makeNode('aaa', 'Q1规划', '这是Q1规划文档'),
      makeNode('bbb', 'Q1回顾', '参考Q1规划中的目标'),
    ];
    const edges = findMentionEdges(nodes);
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('bbb');
    expect(edges[0].target).toBe('aaa');
    expect(edges[0].type).toBe('mention');
  });
});

describe('clusterNodes', () => {
  it('groups connected nodes into clusters', () => {
    const nodes = [makeNode('a', 'A'), makeNode('b', 'B'), makeNode('c', 'C'), makeNode('d', 'D')];
    const edges: Edge[] = [
      { source: 'a', target: 'b', type: 'link', weight: 1 },
      { source: 'c', target: 'd', type: 'link', weight: 1 },
    ];
    const clusters = clusterNodes(nodes, edges);
    expect(clusters).toHaveLength(2);
    // a,b in one cluster; c,d in another
    const clusterIds = clusters.map(c => c.node_ids.sort().join(','));
    expect(clusterIds).toContain('a,b');
    expect(clusterIds).toContain('c,d');
  });

  it('puts isolated nodes in their own cluster', () => {
    const nodes = [makeNode('a', 'A'), makeNode('b', 'B')];
    const edges: Edge[] = [];
    const clusters = clusterNodes(nodes, edges);
    expect(clusters).toHaveLength(2);
  });
});
