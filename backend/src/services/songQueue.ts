// Nachträge im Hintergrund (Tempo, Genres): Songs werden nacheinander abgearbeitet, mit
// Pausen zwischen den Online-Abfragen, damit die Quellen nicht überrannt werden. Ein
// Neustart der App verwirft die Warteschlange.

import type { Queryable } from '../db.ts';

export interface SongQueueOptions {
  /** Für Meldungen im Protokoll, z. B. „BPM“ */
  label: string;
  /** Pause nach einem Song, für den online nachgeschlagen wurde */
  delayMs: number;
  /** Nach so vielen Fehlschlägen in Folge gibt die Warteschlange auf. */
  maxFailures: number;
  /** Bearbeitet einen Song. false: Es war nichts zu tun, die Pause entfällt. */
  work: (db: Queryable, songId: number) => Promise<boolean>;
}

export class SongQueue {
  readonly #options: SongQueueOptions;
  #queue: Array<{ db: Queryable; songId: number }> = [];
  #worker: Promise<void> | null = null;

  constructor(options: SongQueueOptions) {
    this.#options = options;
  }

  add(db: Queryable, songIds: readonly number[]): void {
    if (songIds.length === 0) return;
    this.#queue.push(...songIds.map((songId) => ({ db, songId })));
    this.#worker ??= this.#run();
  }

  /** Wartet, bis die Warteschlange abgearbeitet ist (für Tests). */
  async idle(): Promise<void> {
    while (this.#worker) await this.#worker;
  }

  async #run(): Promise<void> {
    try {
      await this.#drain();
    } finally {
      this.#worker = null;
    }
  }

  async #drain(): Promise<void> {
    const { label, delayMs, maxFailures, work } = this.#options;
    let failures = 0;
    while (this.#queue.length > 0) {
      const { db, songId } = this.#queue.shift()!;
      let pause = false;
      try {
        pause = await work(db, songId);
        failures = 0;
      } catch (err) {
        failures += 1;
        pause = true;
        console.warn(`${label} für Song ${songId} nicht nachgetragen:`, err instanceof Error ? err.message : err);
        if (failures >= maxFailures) {
          console.warn(`${label}-Nachtrag abgebrochen; ${this.#queue.length} Songs bleiben ohne.`);
          this.#queue = [];
        }
      }
      if (pause && this.#queue.length > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
