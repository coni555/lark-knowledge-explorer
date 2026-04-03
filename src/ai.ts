// src/ai.ts

interface AIConfig {
  apiKey: string;
  baseUrl: string;     // OpenAI-compatible endpoint
  model: string;
}

let config: AIConfig | null = null;

export function configureAI(cfg: AIConfig) {
  config = cfg;
}

async function chatComplete(systemPrompt: string, userPrompt: string): Promise<string> {
  if (!config) throw new Error('AI not configured. Set OPENAI_API_KEY or call configureAI().');

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

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`AI API error ${resp.status}: ${text}`);
  }

  const data = await resp.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0].message.content;
}

// --- Summarize a document ---

export async function summarizeDoc(title: string, content: string): Promise<{ summary: string; keywords: string[] }> {
  const system = `你是知识管理助手。为给定文档生成：
1. 一句话中文摘要（不超过100字）
2. 3-5个关键词

严格以JSON格式返回：{"summary": "...", "keywords": ["...", "..."]}`;

  const user = `文档标题：${title}\n\n文档内容（截取前3000字）：\n${content.slice(0, 3000)}`;
  const raw = await chatComplete(system, user);

  try {
    const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned);
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
    const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned);
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
    const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return { suggestion: '', reasoning: '' };
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
