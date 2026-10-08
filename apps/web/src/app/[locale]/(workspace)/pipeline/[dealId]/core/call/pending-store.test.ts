import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openPendingStore } from './pending-store';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('openPendingStore', () => {
  it('returns both tracks of an interrupted recording', async () => {
    const store = openPendingStore('engagement-recovered', () => 1_000);
    await store.append('client', new Blob(['client']));
    await store.append('studio', new Blob(['studio']));

    const pending = await store.load();

    expect(await pending?.client.text()).toBe('client');
    expect(await pending?.studio?.text()).toBe('studio');
    await store.clear();
    expect(await store.load()).toBeNull();
  });

  it('deletes audio kept in the browser for more than seven days', async () => {
    let now = Date.UTC(2026, 9, 1);
    const store = openPendingStore('engagement-expired', () => now);
    await store.append('client', new Blob(['client']));

    now += 7 * DAY_MS + 1;
    const other = openPendingStore('engagement-other', () => now);

    expect(await other.load()).toBeNull();
    expect(await store.load()).toBeNull();
  });
});
