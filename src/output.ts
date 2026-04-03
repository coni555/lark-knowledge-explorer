// src/output.ts
import type {
  KnowledgeNode, Edge, Cluster,
  StructuralInsight, SemanticInsight, CollisionInsight, ExploreResult,
} from './types.js';
import { createDoc } from './lark.js';
import chalk from 'chalk';

// --- Terminal Output ---

export function printTerminalReport(result: ExploreResult): void {
  const { nodes, edges, clusters, structural_insights, semantic_insights, collision_insights } = result;

  console.log('');
  console.log(chalk.bold(`🔍 扫描完成：${nodes.length} 篇文档`));
  console.log('');

  // Health
  console.log(chalk.bold('📊 知识健康度'));
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  for (const insight of structural_insights) {
    const icon = { hub: '🏛', orphan: '🏝', bridge: '🌉', stale: '⏰' }[insight.type];
    const label = { hub: '枢纽文档', orphan: '孤岛文档', bridge: '桥梁文档', stale: '可能过期' }[insight.type];
    const names = insight.node_ids.slice(0, 3).map(id => nodeMap.get(id)?.title ?? id);
    const suffix = insight.node_ids.length > 3 ? ` 等${insight.node_ids.length}篇` : '';
    console.log(chalk.gray(`  ${icon} ${label} (${insight.node_ids.length})：${names.join('、')}${suffix}`));
  }

  // Clusters
  const namedClusters = clusters.filter(c => c.label && c.node_ids.length >= 2);
  if (namedClusters.length > 0) {
    console.log('');
    console.log(chalk.bold(`🔗 发现 ${namedClusters.length} 个主题聚类`));
    for (const c of namedClusters) {
      console.log(chalk.gray(`  ├ #${c.label} (${c.node_ids.length}篇)`));
    }
  }

  // Collisions
  if (collision_insights.length > 0) {
    console.log('');
    console.log(chalk.bold(`💡 碰撞洞察 (Top ${collision_insights.length})`));
    collision_insights.forEach((ci, i) => {
      const a = nodeMap.get(ci.node_a_id)?.title ?? ci.node_a_id;
      const b = nodeMap.get(ci.node_b_id)?.title ?? ci.node_b_id;
      console.log(chalk.yellow(`  ${i + 1}.《${a}》×《${b}》→ ${ci.suggestion}`));
    });
  }

  console.log('');
}

// --- Feishu Document Output ---

function buildFeishuMarkdown(result: ExploreResult): string {
  const { nodes, clusters, structural_insights, semantic_insights, collision_insights } = result;
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const parts: string[] = [];

  // Overview
  parts.push(`## 概览\n`);
  parts.push(`- 扫描时间：${result.scanned_at}`);
  parts.push(`- 文档数量：${nodes.length} 篇`);
  parts.push(`- 关系数量：${result.edges.length} 条`);
  parts.push(`- 主题聚类：${clusters.length} 个`);
  parts.push('');

  // Structural insights
  if (structural_insights.length > 0) {
    parts.push(`## 知识图谱摘要\n`);
    for (const insight of structural_insights) {
      const label = { hub: '🏛 枢纽文档', orphan: '🏝 孤岛文档', bridge: '🌉 桥梁文档', stale: '⏰ 可能过期' }[insight.type];
      parts.push(`### ${label}\n`);
      for (const nid of insight.node_ids) {
        const n = nodeMap.get(nid);
        if (n) parts.push(`- [${n.title}](${n.url})`);
      }
      parts.push(`\n${insight.description}\n`);
    }
  }

  // Cluster analysis
  const namedClusters = clusters.filter(c => c.label && c.node_ids.length >= 2);
  if (namedClusters.length > 0) {
    parts.push(`## 主题聚类\n`);
    for (const c of namedClusters) {
      parts.push(`### #${c.label} (${c.node_ids.length}篇)\n`);
      for (const nid of c.node_ids) {
        const n = nodeMap.get(nid);
        if (n) parts.push(`- [${n.title}](${n.url})`);
      }
      // Find matching semantic insight
      const si = semantic_insights.find(s => s.cluster_id === c.id);
      if (si) {
        parts.push(`\n${si.summary}`);
        if (si.contradictions.length > 0) {
          parts.push(`\n<callout emoji="⚠️" background-color="light-yellow">\n**矛盾观点：** ${si.contradictions.join('；')}\n</callout>`);
        }
        if (si.duplicates.length > 0) {
          parts.push(`\n<callout emoji="📋" background-color="light-blue">\n**可能重复：** ${si.duplicates.join('；')}\n</callout>`);
        }
      }
      parts.push('');
    }
  }

  // Collision insights
  if (collision_insights.length > 0) {
    parts.push(`## 碰撞洞察\n`);
    for (const ci of collision_insights) {
      const a = nodeMap.get(ci.node_a_id);
      const b = nodeMap.get(ci.node_b_id);
      const aTitle = a ? `[${a.title}](${a.url})` : ci.node_a_id;
      const bTitle = b ? `[${b.title}](${b.url})` : ci.node_b_id;
      parts.push(`### ${aTitle} × ${bTitle}\n`);
      parts.push(`<callout emoji="💡" background-color="light-green">\n**建议：** ${ci.suggestion}\n</callout>\n`);
      parts.push(`${ci.reasoning}\n`);
    }
  }

  return parts.join('\n');
}

export async function publishToFeishu(result: ExploreResult): Promise<string | null> {
  const markdown = buildFeishuMarkdown(result);
  const title = `知识探索报告 ${result.scanned_at.split('T')[0]}`;

  try {
    console.log(chalk.blue('📄 正在创建飞书文档...'));
    const doc = await createDoc(title, markdown);
    console.log(chalk.green(`   ✓ 报告已生成 → ${doc.doc_url}`));
    return doc.doc_url;
  } catch (err) {
    console.warn(chalk.yellow(`   ⚠ 飞书文档创建失败: ${(err as Error).message}`));
    console.warn(chalk.yellow('   提示：请确认 lark-cli 已登录且有 docx:document scope'));
    return null;
  }
}
