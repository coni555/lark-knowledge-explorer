// src/output.ts
import type {
  KnowledgeNode, Edge, Cluster,
  StructuralInsight, SemanticInsight, CollisionInsight, ExploreResult,
} from './types.js';
import { createDoc, updateDoc } from './lark.js';
import { CacheStore } from './cache.js';
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
    for (let ci = 0; ci < namedClusters.length; ci++) {
      const c = namedClusters[ci];
      const isLast = ci === namedClusters.length - 1;
      const prefix = isLast ? '└' : '├';
      console.log(chalk.bold(`  ${prefix} #${c.label} (${c.node_ids.length}篇)`));
      const titles = c.node_ids.map(id => nodeMap.get(id)?.title).filter(Boolean);
      const docPrefix = isLast ? ' ' : '│';
      for (const t of titles) {
        console.log(chalk.gray(`  ${docPrefix}   · ${t}`));
      }
    }
  }

  // Collisions
  if (collision_insights.length > 0) {
    console.log('');
    console.log(chalk.bold(`💡 碰撞洞察 (Top ${collision_insights.length})`));
    collision_insights.forEach((ci, i) => {
      const a = nodeMap.get(ci.node_a_id)?.title ?? ci.node_a_id;
      const b = nodeMap.get(ci.node_b_id)?.title ?? ci.node_b_id;
      console.log(chalk.yellow(`  ${i + 1}.《${a}》×《${b}》`));
      console.log(chalk.white(`     → ${ci.suggestion}`));
      if (ci.reasoning) {
        console.log(chalk.gray(`     ${ci.reasoning}`));
      }
    });
  }

  // Health summary
  const dupCount = semantic_insights.flatMap(si => si.duplicates).length;
  const staleCount = structural_insights.filter(si => si.type === 'stale').flatMap(si => si.node_ids).length;
  const orphanCount = structural_insights.filter(si => si.type === 'orphan').flatMap(si => si.node_ids).length;
  if (dupCount + staleCount + orphanCount > 0) {
    const parts: string[] = [];
    if (dupCount > 0) parts.push(`${dupCount} 组重复文档待合并`);
    if (staleCount > 0) parts.push(`${staleCount} 篇过期文档待更新`);
    if (orphanCount > 0) parts.push(`${orphanCount} 篇孤岛文档待关联`);
    console.log(chalk.bold(`📋 健康建议：${parts.join('，')}`));
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
  parts.push(`<callout emoji="📊" background-color="light-blue">`);
  parts.push(`**扫描时间：** ${result.scanned_at.split('T')[0]}`);
  parts.push(`**文档数量：** ${nodes.length} 篇 · **关系数量：** ${result.edges.length} 条 · **主题聚类：** ${clusters.length} 个`);
  parts.push(`</callout>\n`);

  // Structural insights
  if (structural_insights.length > 0) {
    parts.push(`---\n`);
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
    parts.push(`---\n`);
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

  // Health recommendations
  const allDuplicates = semantic_insights.flatMap(si => si.duplicates);
  const staleNodes = structural_insights.find(si => si.type === 'stale')?.node_ids ?? [];
  const orphanNodes = structural_insights.find(si => si.type === 'orphan')?.node_ids ?? [];

  if (allDuplicates.length > 0 || staleNodes.length > 0 || orphanNodes.length > 0) {
    parts.push(`---\n`);
    parts.push(`## 知识健康建议\n`);

    if (allDuplicates.length > 0) {
      parts.push(`### 📋 建议合并的重复文档\n`);
      for (const dup of allDuplicates) {
        parts.push(`- ${dup}`);
      }
      parts.push('');
    }

    if (staleNodes.length > 0) {
      parts.push(`### ⏰ 建议更新的过期文档\n`);
      for (const nid of staleNodes) {
        const n = nodeMap.get(nid);
        if (n) parts.push(`- [${n.title}](${n.url})`);
      }
      parts.push('');
    }

    if (orphanNodes.length > 0) {
      parts.push(`### 🏝 建议关联的孤岛文档\n`);
      for (const nid of orphanNodes) {
        const n = nodeMap.get(nid);
        if (n) parts.push(`- [${n.title}](${n.url})`);
      }
      parts.push('');
    }
  }

  // Collision insights
  if (collision_insights.length > 0) {
    parts.push(`---\n`);
    parts.push(`## 碰撞洞察\n`);
    for (const ci of collision_insights) {
      const a = nodeMap.get(ci.node_a_id);
      const b = nodeMap.get(ci.node_b_id);
      const aTitle = a ? `[${a.title}](${a.url})` : ci.node_a_id;
      const bTitle = b ? `[${b.title}](${b.url})` : ci.node_b_id;
      parts.push(`### ${aTitle} × ${bTitle}\n`);
      parts.push(`<callout emoji="💡" background-color="light-green">\n**建议：** ${ci.suggestion}\n</callout>\n`);
      if (ci.reasoning) {
        parts.push(`<callout emoji="🔍" background-color="light-grey">\n**分析：** ${ci.reasoning}\n</callout>\n`);
      }
    }
  }

  // Action checklist
  const actions: string[] = [];

  // Stale docs action
  const staleDocs = structural_insights.find(si => si.type === 'stale');
  if (staleDocs && staleDocs.node_ids.length > 0) {
    for (const nid of staleDocs.node_ids.slice(0, 3)) {
      const n = nodeMap.get(nid);
      if (n) {
        const days = Math.floor((Date.now() - new Date(n.updated_at).getTime()) / (24 * 60 * 60 * 1000));
        actions.push(`更新 [${n.title}](${n.url})（已 ${days} 天未更新）`);
      }
    }
  }

  // Collision actions
  for (const ci of collision_insights.slice(0, 2)) {
    const a = nodeMap.get(ci.node_a_id);
    const b = nodeMap.get(ci.node_b_id);
    if (a && b) {
      actions.push(`探索碰撞洞察：「${a.title}」×「${b.title}」— ${ci.suggestion.slice(0, 40)}...`);
    }
  }

  // Orphan docs action
  const orphanInsight = structural_insights.find(si => si.type === 'orphan');
  if (orphanInsight && orphanInsight.node_ids.length > 0) {
    actions.push(`整理 ${orphanInsight.node_ids.length} 篇孤岛文档（归入知识空间或归档）`);
  }

  // Duplicate action
  if (allDuplicates.length > 0) {
    actions.push(`合并 ${allDuplicates.length} 组疑似重复文档`);
  }

  // Next scan suggestion
  actions.push(`下次扫描建议：2 周后（知识库有足够变化时）`);

  if (actions.length > 0) {
    parts.push(`---\n`);
    parts.push(`## 📌 建议行动\n`);
    for (const action of actions) {
      parts.push(`- [ ] ${action}`);
    }
    parts.push('');
  }

  return parts.join('\n');
}

export async function publishToFeishu(result: ExploreResult, cache?: CacheStore): Promise<string | null> {
  const markdown = buildFeishuMarkdown(result);
  const today = result.scanned_at.split('T')[0];
  const title = `知识探索报告 ${today}`;

  try {
    // Check if we already created a report today — overwrite instead of creating a new one
    const meta = await cache?.readMeta();
    if (meta?.report_doc_id && meta?.report_date === today) {
      console.log(chalk.blue('📄 检测到今日已有报告，正在覆盖更新...'));
      await updateDoc(meta.report_doc_id, markdown, title);
      console.log(chalk.green(`   ✓ 报告已更新 → ${meta.report_doc_url}`));
      return meta.report_doc_url ?? null;
    }

    // No existing report today — create new
    console.log(chalk.blue('📄 正在创建飞书文档...'));
    const doc = await createDoc(title, markdown);
    console.log(chalk.green(`   ✓ 报告已生成 → ${doc.doc_url}`));

    // Save doc reference to meta for future reruns
    if (cache && meta) {
      await cache.writeMeta({
        ...meta,
        report_doc_id: doc.doc_id,
        report_doc_url: doc.doc_url,
        report_date: today,
      });
    }

    return doc.doc_url;
  } catch (err) {
    console.warn(chalk.yellow(`   ⚠ 飞书文档创建/更新失败: ${(err as Error).message}`));
    console.warn(chalk.yellow('   提示：请确认 lark-cli 已登录且有 docx:document scope'));
    return null;
  }
}
