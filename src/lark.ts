// src/lark.ts
import { execSync, execFileSync } from 'child_process';

interface LarkExecOptions {
  timeout?: number;  // ms, default 30000
}

function larkExec(args: string[], opts: LarkExecOptions = {}): string {
  const cmd = `lark-cli ${args.join(' ')}`;
  const result = execSync(cmd, {
    encoding: 'utf-8',
    timeout: opts.timeout ?? 30000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return result;
}

function larkJSON<T = unknown>(args: string[], opts?: LarkExecOptions): T {
  const raw = larkExec([...args, '--format', 'json'], opts);
  return JSON.parse(raw) as T;
}

// --- Current User ---

interface AuthStatus {
  userName: string;
  userOpenId: string;
}

let _currentUser: AuthStatus | null = null;

export function getCurrentUser(): AuthStatus {
  if (_currentUser) return _currentUser;
  const raw = larkExec(['auth', 'status']);
  const parsed = JSON.parse(raw) as AuthStatus;
  _currentUser = parsed;
  return parsed;
}

// --- Search ---

interface SearchResultItem {
  doc_id: string;
  title: string;
  url: string;
  type: string;           // DOC, WIKI, SHEET, etc.
  owner_id?: string;
  owner_name?: string;
  create_time_iso?: string;
  edit_time_iso?: string;
}

interface RawSearchResponse {
  ok: boolean;
  data: {
    has_more: boolean;
    page_token?: string;
    results: Array<{
      entity_type: string;
      result_meta: {
        token: string;
        url: string;
        doc_types: string;
        owner_id?: string;
        owner_name?: string;
        create_time_iso?: string;
        update_time_iso?: string;
      };
      title_highlighted: string;
    }>;
  };
}

function parseSearchResults(raw: RawSearchResponse): { items: SearchResultItem[]; has_more: boolean; page_token?: string } {
  const items = (raw.data.results ?? []).map(r => ({
    doc_id: r.result_meta.token,
    title: r.title_highlighted.replace(/<\/?h[b]?>/g, ''),  // strip highlight tags
    url: r.result_meta.url,
    type: r.result_meta.doc_types ?? r.entity_type,  // DOCX, SLIDES, SHEET, etc.
    owner_id: (r.result_meta as Record<string, unknown>).owner_id as string | undefined,
    owner_name: (r.result_meta as Record<string, unknown>).owner_name as string | undefined,
    create_time_iso: r.result_meta.create_time_iso,
    edit_time_iso: r.result_meta.update_time_iso,
  }));
  return { items, has_more: raw.data.has_more, page_token: raw.data.page_token };
}

export async function searchDocs(query: string, maxPages = 10): Promise<SearchResultItem[]> {
  const allItems: SearchResultItem[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const args = ['docs', '+search', '--query', JSON.stringify(query), '--page-size', '20'];
    if (pageToken) args.push('--page-token', pageToken);

    const raw = larkJSON<RawSearchResponse>(args);
    const { items, has_more, page_token } = parseSearchResults(raw);
    allItems.push(...items);

    if (!has_more || !page_token) break;
    pageToken = page_token;
  }

  return allItems;
}

// --- Wiki Space Scanning ---

export interface WikiSpaceInfo {
  space_id: string;
  name: string;
  description: string;
}

export interface WikiNodeInfo {
  node_token: string;
  obj_token: string;
  obj_type: string;          // docx, doc, sheet, bitable, slides, etc.
  title: string;
  has_child: boolean;
  parent_node_token: string;
  space_id: string;
  owner: string;             // open_id of owner
  obj_edit_time: string;     // unix timestamp string
}

interface RawSpacesResponse {
  code: number;
  data: {
    has_more: boolean;
    items: Array<{
      space_id: string;
      name: string;
      description: string;
    }>;
    page_token?: string;
  };
}

interface RawSpaceNodesResponse {
  code: number;
  data: {
    has_more: boolean;
    items: Array<{
      node_token: string;
      obj_token: string;
      obj_type: string;
      title: string;
      has_child: boolean;
      parent_node_token: string;
      space_id: string;
      obj_edit_time: string;
    }>;
    page_token?: string;
  };
}

function larkAPI<T = unknown>(method: string, path: string, params?: Record<string, string>): T {
  const args = ['api', method, path, '--format', 'json', '--page-all'];
  if (params) args.push('--params', JSON.stringify(params));
  // Use execFileSync to avoid shell escaping issues with JSON params
  const raw = execFileSync('lark-cli', args, {
    encoding: 'utf-8',
    timeout: 60000,
    maxBuffer: 10 * 1024 * 1024,
  });
  // --page-all output may have pagination log lines, extract JSON
  const jsonStart = raw.indexOf('{');
  if (jsonStart < 0) throw new Error(`No JSON in lark-cli api response: ${raw.slice(0, 200)}`);
  return JSON.parse(raw.slice(jsonStart)) as T;
}

export async function listSpaces(): Promise<WikiSpaceInfo[]> {
  const raw = larkAPI<RawSpacesResponse>('GET', '/open-apis/wiki/v2/spaces');
  if (raw.code !== 0) throw new Error(`listSpaces failed: code ${raw.code}`);
  return (raw.data.items ?? []).map(s => ({
    space_id: s.space_id,
    name: s.name,
    description: s.description,
  }));
}

export async function listSpaceNodes(spaceId: string, parentToken?: string): Promise<WikiNodeInfo[]> {
  const params: Record<string, string> = {};
  if (parentToken !== undefined) params.parent_node_token = parentToken;

  const raw = larkAPI<RawSpaceNodesResponse>('GET', `/open-apis/wiki/v2/spaces/${spaceId}/nodes`, Object.keys(params).length > 0 ? params : undefined);
  if (raw.code !== 0) throw new Error(`listSpaceNodes failed: code ${raw.code}`);
  return (raw.data.items ?? []).map(n => ({
    node_token: n.node_token,
    obj_token: n.obj_token,
    obj_type: n.obj_type,
    title: n.title,
    has_child: n.has_child,
    parent_node_token: n.parent_node_token,
    space_id: n.space_id,
    owner: (n as Record<string, unknown>).owner as string ?? '',
    obj_edit_time: n.obj_edit_time,
  }));
}

// Recursively get ALL nodes in a space (tree traversal)
export async function listAllSpaceNodes(spaceId: string): Promise<WikiNodeInfo[]> {
  const allNodes: WikiNodeInfo[] = [];

  async function traverse(parentToken?: string) {
    const nodes = await listSpaceNodes(spaceId, parentToken);
    for (const node of nodes) {
      allNodes.push(node);
      if (node.has_child) {
        await traverse(node.node_token);
      }
    }
  }

  await traverse('');  // empty string = root level
  return allNodes;
}

// --- Wiki Node Resolution ---

interface WikiNodeResult {
  node: {
    obj_type: string;      // docx, sheet, bitable, etc.
    obj_token: string;
    title: string;
    space_id: string;
    node_token: string;
  };
}

interface RawWikiResponse {
  ok: boolean;
  data: { node: WikiNodeResult['node'] };
}

export async function resolveWikiNode(wikiToken: string): Promise<WikiNodeResult['node']> {
  const raw = larkJSON<RawWikiResponse>(
    ['wiki', 'spaces', 'get_node', '--params', JSON.stringify({ token: wikiToken })]
  );
  return raw.data.node;
}

// --- Fetch Document Content ---

interface RawFetchResponse {
  ok: boolean;
  data: {
    doc_id: string;
    markdown: string;
    message: string;
    title?: string;
  };
}

export async function fetchDocContent(docToken: string): Promise<{ title: string; markdown: string }> {
  const raw = larkJSON<RawFetchResponse>(
    ['docs', '+fetch', '--doc', docToken],
    { timeout: 60000 }
  );
  return { title: raw.data.title ?? '', markdown: raw.data.markdown };
}

// --- Create Document ---

interface CreateResult {
  doc_id: string;
  doc_url: string;
  message: string;
}

interface RawCreateResponse {
  ok: boolean;
  data: CreateResult;
}

export async function createDoc(title: string, markdown: string, wikiSpace?: string): Promise<CreateResult> {
  // Use execFileSync to bypass shell — avoids all escaping issues with markdown content
  const args = ['docs', '+create', '--title', title, '--markdown', markdown];
  if (wikiSpace) args.push('--wiki-space', wikiSpace);

  const raw = execFileSync('lark-cli', args, {
    encoding: 'utf-8',
    timeout: 120000,
    maxBuffer: 10 * 1024 * 1024,
  });

  try {
    const parsed = JSON.parse(raw) as RawCreateResponse;
    return parsed.data;
  } catch {
    const urlMatch = raw.match(/https?:\/\/[^\s"]+/);
    return { doc_id: '', doc_url: urlMatch?.[0] ?? '', message: raw.trim() };
  }
}
