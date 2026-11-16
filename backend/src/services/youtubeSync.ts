// Abgleich einer YouTube-Playlist mit einer Playlist der App. Jede Änderung kostet bei
// YouTube 50 Einheiten, deshalb wird mit möglichst wenigen Schritten umgebaut: Videos,
// die bereits in der richtigen Reihenfolge stehen, bleiben liegen; nur der Rest wird
// verschoben, eingefügt oder entfernt.

export interface RemoteItem {
  /** ID des Playlist-Eintrags bei YouTube */
  itemId: string;
  videoId: string;
}

/** YouTube lehnt Positionsangaben ab, weil die Playlist nicht von Hand sortiert ist. */
export class ManualSortRequiredError extends Error {
  constructor() {
    super('Die Playlist ist auf YouTube nicht manuell sortiert.');
    this.name = 'ManualSortRequiredError';
  }
}

export interface SyncExecutor {
  remove(item: RemoteItem): Promise<void>;
  /** position null: ans Ende anhängen. Gibt null zurück, wenn es das Video nicht (mehr) gibt. */
  insert(videoId: string, position: number | null): Promise<RemoteItem | null>;
  move(item: RemoteItem, position: number): Promise<void>;
}

export interface SyncPlan {
  /** Gewünschte Reihenfolge ohne doppelte Videos */
  target: string[];
  /** Einträge, die entfernt werden (nicht mehr gewünscht oder doppelt) */
  removals: RemoteItem[];
  /** Verbleibende Einträge in der Reihenfolge auf YouTube */
  kept: RemoteItem[];
  /** Videos, die schon richtig stehen und nicht angefasst werden */
  stable: Set<string>;
  /** Anzahl der Änderungen, die YouTube ausführen muss */
  operationCount: number;
}

/** Indizes einer längsten streng aufsteigenden Teilfolge (O(n log n)). */
export function longestIncreasingSubsequence(values: readonly number[]): Set<number> {
  const tails: number[] = [];
  const previous = new Array<number>(values.length).fill(-1);
  for (let i = 0; i < values.length; i++) {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (values[tails[middle]!]! < values[i]!) low = middle + 1;
      else high = middle;
    }
    if (low > 0) previous[i] = tails[low - 1]!;
    tails[low] = i;
  }
  const result = new Set<number>();
  for (let index = tails.length > 0 ? tails[tails.length - 1]! : -1; index !== -1; index = previous[index]!) {
    result.add(index);
  }
  return result;
}

export function planSync(remote: readonly RemoteItem[], desired: readonly string[]): SyncPlan {
  const target = [...new Set(desired)];
  const targetIndex = new Map(target.map((videoId, index) => [videoId, index]));

  const removals: RemoteItem[] = [];
  const kept: RemoteItem[] = [];
  const seen = new Set<string>();
  for (const item of remote) {
    if (!targetIndex.has(item.videoId) || seen.has(item.videoId)) {
      removals.push(item);
    } else {
      seen.add(item.videoId);
      kept.push(item);
    }
  }

  const stableIndexes = longestIncreasingSubsequence(kept.map((item) => targetIndex.get(item.videoId)!));
  const stable = new Set(kept.filter((_, index) => stableIndexes.has(index)).map((item) => item.videoId));
  const operationCount = removals.length + target.filter((videoId) => !stable.has(videoId)).length;
  return { target, removals, kept, stable, operationCount };
}

export interface SyncOutcome {
  added: number;
  removed: number;
  moved: number;
  /** Videos, die YouTube nicht (mehr) kennt */
  unavailable: string[];
  /** Die Reihenfolge ließ sich nicht übernehmen (Playlist auf YouTube automatisch sortiert). */
  orderSkipped: boolean;
}

/**
 * Bringt die YouTube-Playlist auf den Stand von `plan.target`. Jedes Video, das nicht
 * schon richtig steht, wird direkt hinter seinen Vorgänger gesetzt; in aufsteigender
 * Reihenfolge abgearbeitet ergibt das genau die gewünschte Liste.
 */
export async function executeSync(
  plan: SyncPlan,
  executor: SyncExecutor,
  onProgress?: (done: number, total: number) => void,
): Promise<SyncOutcome> {
  const outcome: SyncOutcome = { added: 0, removed: 0, moved: 0, unavailable: [], orderSkipped: false };
  let done = 0;
  const tick = () => onProgress?.(++done, plan.operationCount);

  for (const item of plan.removals) {
    await executor.remove(item);
    outcome.removed++;
    tick();
  }

  // So sieht die Playlist auf YouTube gerade aus.
  let live: RemoteItem[] = [...plan.kept];
  let positionsAllowed = true;

  const positionAfterPredecessor = (list: readonly RemoteItem[], targetIndex: number): number => {
    for (let j = targetIndex - 1; j >= 0; j--) {
      const index = list.findIndex((item) => item.videoId === plan.target[j]);
      if (index !== -1) return index + 1;
    }
    return 0;
  };

  for (let i = 0; i < plan.target.length; i++) {
    const videoId = plan.target[i]!;
    if (plan.stable.has(videoId)) continue;

    const currentIndex = live.findIndex((item) => item.videoId === videoId);
    if (currentIndex !== -1) {
      if (positionsAllowed) {
        const item = live[currentIndex]!;
        const without = live.filter((_, index) => index !== currentIndex);
        const position = positionAfterPredecessor(without, i);
        try {
          await executor.move(item, position);
          without.splice(position, 0, item);
          live = without;
          outcome.moved++;
        } catch (err) {
          if (!(err instanceof ManualSortRequiredError)) throw err;
          positionsAllowed = false;
          outcome.orderSkipped = true;
        }
      }
      tick();
      continue;
    }

    let position = positionsAllowed ? positionAfterPredecessor(live, i) : live.length;
    let inserted: RemoteItem | null;
    try {
      inserted = await executor.insert(videoId, position === live.length ? null : position);
    } catch (err) {
      if (!(err instanceof ManualSortRequiredError)) throw err;
      positionsAllowed = false;
      outcome.orderSkipped = true;
      position = live.length;
      inserted = await executor.insert(videoId, null);
    }
    if (inserted) {
      live.splice(position, 0, inserted);
      outcome.added++;
    } else {
      outcome.unavailable.push(videoId);
    }
    tick();
  }

  return outcome;
}
