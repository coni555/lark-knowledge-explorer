// src/collect.ts
import { searchDocs, listSpaces, listAllSpaceNodes, fetchDocContent, resolveWikiNode, getCurrentUser } from './lark.js';
import { CacheStore } from './cache.js';
import type { KnowledgeNode } from './types.js';
import chalk from 'chalk';

export interface CollectOptions {
  mode: 'full-scan' | 'keyword-search';
  spaceId?: string;       // full-scan: limit to one space (default: all)
  query?: string;         // keyword-search: search term
  maxPages?: number;      // keyword-search: max pages
  owner?: 'me' | 'others' | string;  // filter by owner: 'me', 'others', or specific name
}

export interface CollectResult {
  nodes: KnowledgeNode[];
  spaceName?: string;
  spaceId?: string;
}

// --- Owner Filter ---

function resolveOwnerFilter(owner?: string): { myOpenId?: string; filterFn: (ownerName?: string, ownerId?: string) => boolean } {
  if (!owner) return { filterFn: () => true };

  const me = getCurrentUser();
  const myOpenId = me.userOpenId;

  if (owner === 'me') {
    console.log(chalk.blue(`👤 过滤模式: 仅我的文档 (${me.userName})`));
    return {
      myOpenId,
      filterFn: (ownerName, ownerId) => ownerId === myOpenId || ownerName === me.userName,
    };
  }

  if (owner === 'others') {
    console.log(chalk.blue(`👥 过滤模式: 仅他人文档`));
    return {
      myOpenId,
      filterFn: (ownerName, ownerId) => ownerId !== myOpenId && ownerName !== me.userName,
    };
  }

  // Specific owner name
  console.log(chalk.blue(`👤 过滤模式: ${owner} 的文档`));
  return {
    filterFn: (ownerName) => ownerName === owner,
  };
}

// --- Full Scan: all wiki spaces + global search ---

async function collectFullScan(cache: CacheStore, limitSpaceId?: string, ownerOpt?: string): Promise<CollectResult> {
  const cachedNodes = await cache.readNodes();
  const cachedMap = new Map(cachedNodes.map(n => [n.id, n]));
  const allNodes: KnowledgeNode[] = [];
  const seenIds = new Set<string>();
  let fetchCount = 0;
  const { myOpenId, filterFn } = resolveOwnerFilter(ownerOpt);

  // Part 1: Scan wiki spaces
  console.log(chalk.blue('📡 正在扫描知识空间...'));
  let spaces: Array<{ space_id: string; name: string }> = [];

  try {
    spaces = await listSpaces();
    if (limitSpaceId) {
      spaces = spaces.filter(s => s.space_id === limitSpaceId);
    }
    console.log(chalk.blue(`   发现 ${spaces.length} 个知识空间`));
  } catch (err) {
    console.warn(chalk.yellow(`   ⚠ 知识空间扫描失败: ${(err as Error).message}`));
    console.warn(chalk.yellow('   提示: 确认 lark-cli 有 wiki:wiki:readonly 权限'));
  }

  for (const space of spaces) {
    console.log(chalk.blue(`   🌳 ${space.name}...`));
    try {
      const wikiNodes = await listAllSpaceNodes(space.space_id);
      let docNodes = wikiNodes.filter(n => n.obj_type === 'docx' || n.obj_type === 'doc');
      // Owner filter for wiki nodes (uses open_id)
      if (ownerOpt) {
        docNodes = docNodes.filter(n => filterFn(undefined, n.owner));
      }
      console.log(chalk.gray(`      ${docNodes.length} 篇文档`));

      for (const wn of docNodes) {
        if (seenIds.has(wn.obj_token)) continue;
        seenIds.add(wn.obj_token);

        const editTime = wn.obj_edit_time
          ? new Date(parseInt(wn.obj_edit_time) * 1000).toISOString()
          : new Date().toISOString();

        // Check cache freshness
        const existing = cachedMap.get(wn.obj_token);
        if (existing?.fetched_at && new Date(existing.fetched_at) >= new Date(editTime)) {
          allNodes.push(existing);
          continue;
        }

        try {
          const content = await fetchDocContent(wn.obj_token);
          allNodes.push({
            id: wn.obj_token,
            type: 'wiki',
            title: content.title || wn.title,
            space: space.name,
            url: `https://feishu.cn/wiki/${wn.node_token}`,
            updated_at: editTime,
            summary: '',
            keywords: [],
            word_count: content.markdown.length,
            fetched_at: new Date().toISOString(),
            content: content.markdown,
          });
          fetchCount++;
          process.stdout.write(chalk.gray(`\r      已抓取 ${fetchCount} 篇...`));
        } catch (err) {
          console.warn(chalk.yellow(`\n      ⚠ 跳过 ${wn.title}: ${(err as Error).message}`));
        }
      }
    } catch (err) {
      console.warn(chalk.yellow(`   ⚠ 空间 ${space.name} 遍历失败: ${(err as Error).message}`));
    }
  }

  if (fetchCount > 0) console.log('');

  // Part 2: Global search to catch non-wiki docs (personal docs, shared docs)
  // Use a broad search — empty query or common terms
  console.log(chalk.blue('🔍 正在全局搜索补充非空间文档...'));
  try {
    const searchResults = await searchDocs('', 10);
    let supplementCount = 0;

    for (const item of searchResults) {
      if (seenIds.has(item.doc_id)) continue;

      const supportedTypes = ['DOC', 'DOCX'];
      if (!supportedTypes.includes(item.type)) continue;

      // Owner filter for search results (uses owner_name and owner_id)
      if (ownerOpt && !filterFn(item.owner_name, item.owner_id)) continue;

      seenIds.add(item.doc_id);

      // Check cache
      const existing = cachedMap.get(item.doc_id);
      if (existing?.fetched_at && item.edit_time_iso) {
        if (new Date(existing.fetched_at) >= new Date(item.edit_time_iso)) {
          allNodes.push(existing);
          supplementCount++;
          continue;
        }
      }

      try {
        const content = await fetchDocContent(item.doc_id);
        allNodes.push({
          id: item.doc_id,
          type: 'doc',
          title: content.title || item.title,
          space: '',
          owner: item.owner_name,
          url: item.url,
          updated_at: item.edit_time_iso ?? new Date().toISOString(),
          summary: '',
          keywords: [],
          word_count: content.markdown.length,
          fetched_at: new Date().toISOString(),
          content: content.markdown,
        });
        supplementCount++;
        fetchCount++;
      } catch {
        // skip silently
      }
    }

    if (supplementCount > 0) {
      console.log(chalk.gray(`   补充了 ${supplementCount} 篇非空间文档`));
    } else {
      console.log(chalk.gray('   无额外文档'));
    }
  } catch (err) {
    console.warn(chalk.yellow(`   ⚠ 全局搜索失败: ${(err as Error).message}`));
  }

  console.log(chalk.green(`✓ 共收集 ${allNodes.length} 篇文档（新抓取 ${fetchCount} 篇）`));
  await cache.writeNodes(allNodes);

  const spaceName = spaces.length === 1 ? spaces[0].name : `${spaces.length} 个空间`;
  const spaceId = spaces.length === 1 ? spaces[0].space_id : undefined;
  return { nodes: allNodes, spaceName, spaceId };
}

// --- Keyword Search Mode ---

async function collectFromSearch(cache: CacheStore, query: string, maxPages?: number): Promise<CollectResult> {
  console.log(chalk.blue(`📡 正在搜索飞书文档: "${query}"...`));

  const searchResults = await searchDocs(query, maxPages ?? 10);
  console.log(chalk.blue(`   找到 ${searchResults.length} 篇文档`));

  const cachedNodes = await cache.readNodes();
  const cachedMap = new Map(cachedNodes.map(n => [n.id, n]));

  const seen = new Set<string>();
  const uniqueResults = searchResults.filter(item => {
    if (seen.has(item.doc_id)) return false;
    seen.add(item.doc_id);
    return true;
  });
  console.log(chalk.blue(`   去重后 ${uniqueResults.length} 篇`));

  const nodes: KnowledgeNode[] = [];
  let fetchCount = 0;

  for (const item of uniqueResults) {
    const id = item.doc_id;
    const existingNode = cachedMap.get(id);

    if (existingNode?.fetched_at && item.edit_time_iso) {
      if (new Date(existingNode.fetched_at) >= new Date(item.edit_time_iso)) {
        nodes.push(existingNode);
        continue;
      }
    }

    try {
      const supportedTypes = ['DOC', 'DOCX', 'WIKI'];
      if (!supportedTypes.includes(item.type)) continue;

      let markdown = '';
      let title = item.title;

      if (item.type === 'WIKI') {
        try {
          const wikiNode = await resolveWikiNode(id);
          if (wikiNode.obj_type === 'docx' || wikiNode.obj_type === 'doc') {
            const content = await fetchDocContent(wikiNode.obj_token);
            markdown = content.markdown;
            title = content.title || title;
          }
        } catch {
          const content = await fetchDocContent(id);
          markdown = content.markdown;
        }
      } else {
        const content = await fetchDocContent(id);
        markdown = content.markdown;
        title = content.title || title;
      }

      nodes.push({
        id,
        type: item.type === 'WIKI' ? 'wiki' : 'doc',
        title,
        space: '',
        url: item.url,
        updated_at: item.edit_time_iso ?? new Date().toISOString(),
        summary: '',
        keywords: [],
        word_count: markdown.length,
        fetched_at: new Date().toISOString(),
        content: markdown,
      });
      fetchCount++;
      process.stdout.write(chalk.gray(`\r   已抓取 ${fetchCount} 篇文档...`));
    } catch (err) {
      console.warn(chalk.yellow(`\n   ⚠ 跳过 ${item.title}: ${(err as Error).message}`));
    }
  }

  console.log(chalk.green(`\n   ✓ 成功收集 ${nodes.length} 篇文档（新抓取 ${fetchCount} 篇）`));
  await cache.writeNodes(nodes);
  return { nodes };
}

// --- Entry Point ---

export async function collectDocuments(cache: CacheStore, opts: CollectOptions): Promise<CollectResult> {
  if (opts.mode === 'keyword-search') {
    if (!opts.query) throw new Error('keyword-search mode requires a query');
    return collectFromSearch(cache, opts.query, opts.maxPages);
  }
  return collectFullScan(cache, opts.spaceId, opts.owner);
}
