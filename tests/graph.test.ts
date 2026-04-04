// tests/graph.test.ts
import { describe, it, expect } from 'vitest';
import { findLinkEdges, findMentionEdges } from '../src/graph.js';
import type { KnowledgeNode } from '../src/types.js';

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

// Note: clustering is now handled by AI batch clustering in buildGraph,
// not by the old union-find clusterNodes. See ai.ts batchCluster().
