// src/ai.ts

interface AIConfig {
  apiKey: string;
  baseUrl: string;     // OpenAI-compatible endpoint
  model: string;
}

let config: AIConfig | null = null;

export function isAIConfigured(): boolean {
  return config !== null;
}

export function configureAI(cfg: AIConfig) {
  config = cfg;
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 8000]; // exponential-ish backoff

async function chatComplete(systemPrompt: string, userPrompt: string): Promise<string> {
  if (!config) throw new Error('AI not configured. Set OPENAI_API_KEY or call configureAI().');

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
        }),
      });

      // Retryable status codes
      if (resp.status === 429 || resp.status >= 500) {
        const text = await resp.text();
        lastError = new Error(`AI API error ${resp.status}: ${text}`);
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
          continue;
        }
        throw lastError;
      }

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`AI API error ${resp.status}: ${text}`);
      }

      const data = await resp.json() as { choices: Array<{ message: { content: string } }> };
      return data.choices[0].message.content;
    } catch (err) {
      lastError = err as Error;
      // Network errors are retryable
      if (attempt < MAX_RETRIES - 1 && (err as Error).message?.includes('fetch')) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new Error('AI request failed after retries');
}

/** Safely extract JSON from AI response (handles markdown fences, trailing text) */
function safeParseJSON<T>(raw: string): T {
  // Strip markdown code fences
  let cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
  // Try to extract JSON array or object if there's surrounding text
  const jsonMatch = cleaned.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (jsonMatch) cleaned = jsonMatch[1];
  return JSON.parse(cleaned);
}

// --- Summarize a document ---

export async function summarizeDoc(title: string, content: string): Promise<{ summary: string; keywords: string[] }> {
  const system = `你是知识管理助手。为给定文档生成：
1. 一句话中文摘要（不超过100字）
2. 5-8个关键词，覆盖三层：
   - 主题词（文档核心话题，如"用户增长"、"留学规划"）
   - 领域词（所属领域，如"产品运营"、"教育"）
   - 实体词（具体名词，如"MBTI"、"飞书"、"英国"）

严格以JSON格式返回：{"summary": "...", "keywords": ["...", "..."]}`;

  const user = `文档标题：${title}\n\n文档内容（截取前3000字）：\n${content.slice(0, 3000)}`;
  const raw = await chatComplete(system, user);

  try {
    return safeParseJSON(raw);
  } catch {
    return { summary: title, keywords: [] };
  }
}

// --- Analyze a cluster ---

export async function analyzeCluster(docs: Array<{ title: string; summary: string }>): Promise<{
  theme: string;
  common_topics: string[];
  contradictions: string[];
  duplicates: string[];
  summary: string;
}> {
  const system = `你是知识图谱分析师。分析一组相关文档，找出：
1. 共同主题标签（一个词）
2. 共同讨论的话题列表
3. 矛盾或分歧观点
4. 可能重复的内容

严格以JSON格式返回：{"theme": "...", "common_topics": [...], "contradictions": [...], "duplicates": [...], "summary": "..."}`;

  const user = docs.map((d, i) => `${i + 1}. 《${d.title}》：${d.summary}`).join('\n');
  const raw = await chatComplete(system, user);

  try {
    return safeParseJSON(raw);
  } catch {
    return { theme: '未分类', common_topics: [], contradictions: [], duplicates: [], summary: '' };
  }
}

// --- Generate collision insight ---

export async function generateCollision(
  docA: { title: string; summary: string; keywords: string[] },
  docB: { title: string; summary: string; keywords: string[] },
): Promise<{ suggestion: string; reasoning: string }> {
  const system = `你是创意碰撞专家。两篇从未被关联的文档放在你面前。
分析它们的结合能产生什么新想法或行动建议。

严格以JSON格式返回：{"suggestion": "一句话行动建议", "reasoning": "为什么这两篇可以结合，2-3句话"}`;

  const user = `文档A：《${docA.title}》
摘要：${docA.summary}
关键词：${docA.keywords.join(', ')}

文档B：《${docB.title}》
摘要：${docB.summary}
关键词：${docB.keywords.join(', ')}`;

  const raw = await chatComplete(system, user);

  try {
    return safeParseJSON(raw);
  } catch {
    return { suggestion: '', reasoning: '' };
  }
}

// --- Batch clustering: group all docs by semantic theme in one call ---

export async function batchCluster(
  docs: Array<{ id: string; title: string; summary: string; keywords: string[] }>
): Promise<Array<{ cluster_label: string; doc_ids: string[] }>> {
  if (docs.length < 2) {
    return [{ cluster_label: '全部文档', doc_ids: docs.map(d => d.id) }];
  }

  const system = `你是知识图谱分析师。将以下文档按语义主题分组。
规则：
- 每篇文档恰好属于一个组
- 组数在 ${Math.max(3, Math.ceil(docs.length / 4))} 到 ${Math.max(4, Math.ceil(docs.length / 2))} 之间
- 宁可多分不要少分：如果两个主题有明显区别，即使相关也应分为不同组
- 每组最多 5 篇文档，超过 5 篇请考虑拆分为子主题
- 组标签用简短的中文主题词（2-6字）
- 无法归类的放入"其他"组

严格以JSON数组格式返回：[{"cluster_label": "主题标签", "doc_ids": ["id1", "id2", ...]}, ...]`;

  // For large doc sets, chunk to avoid context limits
  const CHUNK_SIZE = 60;
  if (docs.length <= 80) {
    return await callBatchCluster(system, docs);
  }

  // Chunk with overlap
  const allClusters: Array<{ cluster_label: string; doc_ids: string[] }> = [];
  for (let i = 0; i < docs.length; i += CHUNK_SIZE - 10) {
    const chunk = docs.slice(i, i + CHUNK_SIZE);
    const result = await callBatchCluster(system, chunk);
    allClusters.push(...result);
  }

  // Merge clusters with same label
  const merged = new Map<string, Set<string>>();
  for (const c of allClusters) {
    const existing = merged.get(c.cluster_label);
    if (existing) {
      c.doc_ids.forEach(id => existing.add(id));
    } else {
      merged.set(c.cluster_label, new Set(c.doc_ids));
    }
  }

  return [...merged.entries()].map(([label, ids]) => ({
    cluster_label: label,
    doc_ids: [...ids],
  }));
}

async function callBatchCluster(
  system: string,
  docs: Array<{ id: string; title: string; summary: string; keywords: string[] }>
): Promise<Array<{ cluster_label: string; doc_ids: string[] }>> {
  const user = docs.map(d =>
    `[${d.id}] 《${d.title}》：${d.summary}（关键词：${d.keywords.join('、')}）`
  ).join('\n');

  const raw = await chatComplete(system, user);

  try {
    const parsed = safeParseJSON<Array<{ cluster_label: string; doc_ids: string[] }>>(raw);
    if (!Array.isArray(parsed)) throw new Error('not array');
    return parsed;
  } catch {
    // Fallback: put all docs in one cluster
    return [{ cluster_label: '全部文档', doc_ids: docs.map(d => d.id) }];
  }
}

// --- Semantic similarity between two documents ---

export async function judgeSemantic(
  docA: { title: string; summary: string; keywords: string[] },
  docB: { title: string; summary: string; keywords: string[] },
): Promise<{ score: number; reason: string }> {
  const system = `你是知识图谱分析师。判断两篇文档的语义相关性。
评分标准（0-1）：
- 0.8-1.0：讨论同一主题，互为补充
- 0.5-0.7：有交叉领域，部分相关
- 0.3-0.4：弱关联，仅表面相似
- 0.0-0.2：无关

严格以JSON格式返回：{"score": 0.7, "reason": "一句话说明关联原因"}`;

  const user = `文档A：《${docA.title}》
摘要：${docA.summary}
关键词：${docA.keywords.join(', ')}

文档B：《${docB.title}》
摘要：${docB.summary}
关键词：${docB.keywords.join(', ')}`;

  const raw = await chatComplete(system, user);

  try {
    const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return { score: Math.max(0, Math.min(1, parsed.score ?? 0)), reason: parsed.reason ?? '' };
  } catch {
    return { score: 0, reason: '' };
  }
}

// --- Init from env ---

export function initAIFromEnv() {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.AI_API_KEY;
  if (!apiKey) {
    console.warn('Warning: No AI API key found. Set OPENAI_API_KEY or AI_API_KEY.');
    return;
  }
  configureAI({
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    model: process.env.AI_MODEL ?? 'gpt-4o-mini',
  });
}
