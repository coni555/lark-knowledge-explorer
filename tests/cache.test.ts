// tests/cache.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CacheStore } from '../src/cache.js';
import { rm, mkdir } from 'fs/promises';
import { join } from 'path';

const TEST_DIR = join(import.meta.dirname, '.test-cache');

describe('CacheStore', () => {
  let cache: CacheStore;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    cache = new CacheStore(TEST_DIR);
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('writes and reads nodes', async () => {
    const nodes = [{ id: 'test_1', title: 'Test', type: 'doc' as const,
      space: 's', url: 'u', updated_at: '', summary: '', keywords: [],
      word_count: 0, fetched_at: new Date().toISOString() }];
    await cache.writeNodes(nodes);
    const read = await cache.readNodes();
    expect(read).toHaveLength(1);
    expect(read[0].id).toBe('test_1');
  });

  it('detects stale nodes by updated_at vs fetched_at', () => {
    const node = {
      id: 'n1', type: 'doc' as const, title: '', space: '', url: '',
      updated_at: '2026-04-03T10:00:00Z',
      fetched_at: '2026-04-02T10:00:00Z',
      summary: '', keywords: [], word_count: 0,
    };
    expect(cache.isNodeFresh(node)).toBe(false);

    const fresh = { ...node, fetched_at: '2026-04-03T12:00:00Z' };
    expect(cache.isNodeFresh(fresh)).toBe(true);
  });
});
