// src/lark.ts
import { execFileSync } from 'child_process';

interface LarkExecOptions {
  timeout?: number;  // ms, default 30000
}

function larkExec(args: string[], opts: LarkExecOptions = {}): string {
  const result = execFileSync('lark-cli', args, {
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
// If startNodeToken is provided, only traverse that subtree (folder filtering)
export async function listAllSpaceNodes(spaceId: string, startNodeToken?: string): Promise<WikiNodeInfo[]> {
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

  await traverse(startNodeToken ?? '');  // empty string = root level
  return allNodes;
}

// --- Drive (Cloud Space) Scanning ---

export interface DriveFileInfo {
  token: string;
  name: string;
  type: string;          // folder, docx, doc, bitable, sheet, slides, mindnote, file, shortcut
  owner_id: string;
  parent_token: string;
  created_time: string;  // unix timestamp string
  modified_time: string; // unix timestamp string
  url: string;
  // Shortcut resolution: actual target info (populated for type === 'shortcut')
  target_token?: string; // real doc token
  target_type?: string;  // real doc type (docx, doc, sheet, etc.)
}

interface RawDriveRootResponse {
  code: number;
  data: {
    token: string;
    id: string;
    user_id: string;
  };
}

interface RawDriveFilesResponse {
  code: number;
  data: {
    files: Array<{
      token: string;
      name: string;
      type: string;
      parent_token: string;
      owner_id?: string;
      created_time?: string;
      modified_time?: string;
      url?: string;
      shortcut_info?: {
        target_token: string;
        target_type: string;
      };
    }>;
    has_more?: boolean;
    page_token?: string;
  };
}

export function getRootFolderToken(): string {
  const raw = larkAPI<RawDriveRootResponse>('GET', '/open-apis/drive/explorer/v2/root_folder/meta');
  if (raw.code !== 0) throw new Error(`getRootFolderToken failed: code ${raw.code}`);
  return raw.data.token;
}

export function listDriveFolder(folderToken: string): DriveFileInfo[] {
  const raw = larkAPI<RawDriveFilesResponse>('GET', '/open-apis/drive/v1/files', {
    folder_token: folderToken,
  });
  if (raw.code !== 0) throw new Error(`listDriveFolder failed: code ${raw.code}`);
  return (raw.data.files ?? []).map(f => {
    const isShortcut = f.type === 'shortcut' && f.shortcut_info;
    return {
      // For shortcuts: use target_token as the real doc token
      token: isShortcut ? f.shortcut_info!.target_token : f.token,
      name: f.name,
      // For shortcuts: expose the real target type so docx/doc shortcuts get collected
      type: isShortcut ? f.shortcut_info!.target_type : f.type,
      owner_id: f.owner_id ?? '',
      parent_token: f.parent_token,
      created_time: f.created_time ?? '',
      modified_time: f.modified_time ?? '',
      url: f.url ?? '',
      target_token: isShortcut ? f.shortcut_info!.target_token : undefined,
      target_type: isShortcut ? f.shortcut_info!.target_type : undefined,
    };
  });
}

// Recursively list ALL files under a Drive folder
export function listAllDriveFiles(folderToken: string): DriveFileInfo[] {
  const allFiles: DriveFileInfo[] = [];

  function traverse(token: string) {
    const files = listDriveFolder(token);
    for (const f of files) {
      allFiles.push(f);
      if (f.type === 'folder') {
        traverse(f.token);
      }
    }
  }

  traverse(folderToken);
  return allFiles;
}

// --- Meeting Minutes ---

export interface MeetingInfo {
  id: string;
  topic: string;
  description: string;
}

interface RawVcSearchResponse {
  ok: boolean;
  data: {
    has_more: boolean;
    items: Array<{
      id: string;
      display_info: string;
      meta_data: {
        description: string;
      };
    }>;
    page_token?: string;
  };
}

export function searchMeetings(startTime: string, endTime: string, query?: string): MeetingInfo[] {
  const args = ['vc', '+search', '--start', startTime, '--end', endTime, '--format', 'json'];
  if (query) args.push('--query', query);
  const raw = larkExec(args, { timeout: 30000 });
  const parsed = JSON.parse(raw) as RawVcSearchResponse;
  return (parsed.data?.items ?? []).map(item => {
    // Extract topic from display_info (first line)
    const topic = item.display_info?.split('\n')[0] ?? '';
    return {
      id: item.id,
      topic,
      description: item.meta_data?.description ?? '',
    };
  });
}

interface RawVcNotesResponse {
  ok: boolean;
  data: {
    notes: Array<{
      meeting_id: string;
      note_doc_token?: string;
      verbatim_doc_token?: string;
    }>;
  };
}

export function getMeetingNoteTokens(meetingId: string): { noteToken?: string; verbatimToken?: string } {
  try {
    const args = ['vc', '+notes', '--meeting-ids', meetingId, '--format', 'json'];
    // Suppress stderr to avoid lark-cli diagnostic noise for meetings without notes
    const raw = execFileSync('lark-cli', args, {
      encoding: 'utf-8',
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const parsed = JSON.parse(raw) as RawVcNotesResponse;
    if (!parsed.ok) return {};
    const note = parsed.data?.notes?.[0];
    return {
      noteToken: note?.note_doc_token,
      verbatimToken: note?.verbatim_doc_token,
    };
  } catch {
    return {};
  }
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
