import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  executeSync,
  longestIncreasingSubsequence,
  ManualSortRequiredError,
  planSync,
  type RemoteItem,
  type SyncExecutor,
} from './youtubeSync.ts';

/** Bildet das Verhalten einer YouTube-Playlist nach und zählt die Änderungen. */
class FakePlaylist implements SyncExecutor {
  items: RemoteItem[];
  operations: string[] = [];
  missingVideos = new Set<string>();
  manualSort = true;
  private counter = 0;

  constructor(videoIds: string[]) {
    this.items = videoIds.map((videoId) => ({ itemId: `item-${++this.counter}`, videoId }));
  }

  get videoIds(): string[] {
    return this.items.map((item) => item.videoId);
  }

  async remove(item: RemoteItem): Promise<void> {
    this.operations.push(`remove ${item.videoId}`);
    this.items = this.items.filter((existing) => existing.itemId !== item.itemId);
  }

  async insert(videoId: string, position: number | null): Promise<RemoteItem | null> {
    if (position !== null && !this.manualSort) throw new ManualSortRequiredError();
    this.operations.push(`insert ${videoId}@${position ?? 'end'}`);
    if (this.missingVideos.has(videoId)) return null;
    const item = { itemId: `item-${++this.counter}`, videoId };
    if (position === null) this.items.push(item);
    else this.items.splice(position, 0, item);
    return item;
  }

  async move(item: RemoteItem, position: number): Promise<void> {
    if (!this.manualSort) throw new ManualSortRequiredError();
    this.operations.push(`move ${item.videoId}@${position}`);
    const index = this.items.findIndex((existing) => existing.itemId === item.itemId);
    const [moved] = this.items.splice(index, 1);
    this.items.splice(position, 0, moved!);
  }
}

async function sync(remote: string[], desired: string[], setup?: (playlist: FakePlaylist) => void) {
  const playlist = new FakePlaylist(remote);
  setup?.(playlist);
  const plan = planSync(playlist.items, desired);
  const progress: number[] = [];
  const outcome = await executeSync(plan, playlist, (done) => progress.push(done));
  return { playlist, plan, outcome, progress };
}

describe('longestIncreasingSubsequence', () => {
  test('findet eine längste aufsteigende Teilfolge', () => {
    assert.deepEqual([...longestIncreasingSubsequence([0, 1, 2])].sort(), [0, 1, 2]);
    assert.equal(longestIncreasingSubsequence([2, 0, 1]).size, 2);
    assert.equal(longestIncreasingSubsequence([3, 2, 1, 0]).size, 1);
    assert.equal(longestIncreasingSubsequence([1, 0, 3, 2, 5, 4]).size, 3);
    assert.equal(longestIncreasingSubsequence([]).size, 0);
  });
});

describe('Abgleich einer YouTube-Playlist', () => {
  test('eine neue Playlist wird der Reihe nach befüllt', async () => {
    const { playlist, outcome, progress } = await sync([], ['a', 'b', 'c']);
    assert.deepEqual(playlist.videoIds, ['a', 'b', 'c']);
    assert.deepEqual(playlist.operations, ['insert a@end', 'insert b@end', 'insert c@end']);
    assert.deepEqual(outcome, { added: 3, removed: 0, moved: 0, unavailable: [], orderSkipped: false });
    assert.deepEqual(progress, [1, 2, 3]);
  });

  test('ist schon alles richtig, passiert nichts', async () => {
    const { playlist, plan } = await sync(['a', 'b', 'c'], ['a', 'b', 'c']);
    assert.equal(plan.operationCount, 0);
    assert.deepEqual(playlist.operations, []);
  });

  test('verschiebt nur, was nötig ist', async () => {
    // Das letzte Video nach vorne: ein Schritt statt drei.
    const front = await sync(['a', 'b', 'c', 'd'], ['d', 'a', 'b', 'c']);
    assert.deepEqual(front.playlist.videoIds, ['d', 'a', 'b', 'c']);
    assert.deepEqual(front.playlist.operations, ['move d@0']);

    // Das erste Video nach hinten: ebenfalls ein Schritt.
    const back = await sync(['a', 'b', 'c', 'd'], ['b', 'c', 'd', 'a']);
    assert.deepEqual(back.playlist.videoIds, ['b', 'c', 'd', 'a']);
    assert.deepEqual(back.playlist.operations, ['move a@3']);
  });

  test('entfernt, ergänzt und sortiert in einem Durchgang', async () => {
    const { playlist, outcome } = await sync(['a', 'x', 'b', 'c', 'a', 'y'], ['c', 'a', 'n', 'b', 'm']);
    assert.deepEqual(playlist.videoIds, ['c', 'a', 'n', 'b', 'm']);
    assert.equal(outcome.removed, 3, 'x, y und das doppelte a');
    assert.equal(outcome.added, 2);
    assert.equal(outcome.moved, 1);
  });

  test('doppelte Wünsche führen zu einem einzigen Eintrag', async () => {
    const { playlist } = await sync([], ['a', 'b', 'a']);
    assert.deepEqual(playlist.videoIds, ['a', 'b']);
  });

  test('Videos, die es nicht mehr gibt, werden übersprungen, der Rest stimmt trotzdem', async () => {
    const { playlist, outcome } = await sync(['b'], ['a', 'gone', 'b', 'c'], (fake) => fake.missingVideos.add('gone'));
    assert.deepEqual(playlist.videoIds, ['a', 'b', 'c']);
    assert.deepEqual(outcome.unavailable, ['gone']);
  });

  test('zufällige Fälle ergeben immer die gewünschte Reihenfolge mit minimal vielen Schritten', async () => {
    let seed = 42;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const shuffle = <T>(values: T[]) => values.map((value) => ({ value, key: random() })).sort((a, b) => a.key - b.key).map((entry) => entry.value);
    const pool = 'abcdefghijklmnop'.split('');

    for (let round = 0; round < 200; round++) {
      const remote = shuffle(pool).slice(0, Math.floor(random() * 10));
      const desired = shuffle(pool).slice(0, Math.floor(random() * 10));
      const { playlist, plan } = await sync(remote, desired);
      assert.deepEqual(playlist.videoIds, desired, `Runde ${round}: ${remote.join('')} → ${desired.join('')}`);
      assert.equal(playlist.operations.length, plan.operationCount);
    }
  });

  test('ist die Playlist nicht von Hand sortiert, wird angehängt statt einsortiert', async () => {
    const { playlist, outcome } = await sync(['b', 'a'], ['a', 'b', 'c'], (fake) => {
      fake.manualSort = false;
    });
    assert.equal(outcome.orderSkipped, true);
    assert.deepEqual(new Set(playlist.videoIds), new Set(['a', 'b', 'c']));
    assert.equal(playlist.videoIds.at(-1), 'c');
  });
});
