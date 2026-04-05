# Cache File Schema

All files in `.knowledge-cache/` directory. Claude writes these during Path A Step 2 analysis.

## summaries.json

```json
[
  {
    "id": "doc_token",
    "summary": "一句话中文摘要（≤100字）",
    "keywords": ["主题词", "领域词", "实体词"],
    "updated_at": "2026-04-05T10:00:00Z"
  }
]
```

## clusters.json

```json
[
  {
    "id": "cluster_0",
    "label": "主题标签（2-6字）",
    "node_ids": ["doc_id_1", "doc_id_2"],
    "summary": "该聚类的一句话描述"
  }
]
```

## edges.json

```json
[
  {
    "source": "doc_id_1",
    "target": "doc_id_2",
    "type": "semantic",
    "weight": 0.8,
    "reason": "聚类主题标签"
  }
]
```

## structural_insights.json

```json
[
  {
    "type": "hub|orphan|bridge|stale",
    "node_ids": ["doc_id_1"],
    "description": "中文描述"
  }
]
```

## semantic_insights.json

```json
[
  {
    "cluster_id": "cluster_0",
    "themes": ["共同话题1"],
    "contradictions": ["矛盾观点"],
    "duplicates": ["可能重复的内容"],
    "summary": "聚类分析摘要"
  }
]
```

## collision_insights.json

```json
[
  {
    "node_a_id": "doc_id_1",
    "node_b_id": "doc_id_2",
    "suggestion": "一句话行动建议（要具体、可执行）",
    "reasoning": "为什么这两篇可以结合"
  }
]
```
