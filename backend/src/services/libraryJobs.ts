// Aufträge, die die Bibliothek im Hintergrund Song für Song durchgehen (etwa fehlende
// YouTube-Links suchen). Der Fortschritt lässt sich abfragen, die Funde wachsen laufend; erst
// der Nutzer entscheidet, was davon gespeichert wird. Aufträge leben nur im Speicher: Ein
// Neustart der App verwirft sie.

import { randomBytes } from 'node:crypto';
import type { LibraryJob } from '../types.ts';

/** Fertige Aufträge werden nach dieser Zeit vergessen. */
const KEEP_MS = 60 * 60_000;

export interface JobOptions<T> {
  kind: LibraryJob['kind'];
  /** Songs, die der Reihe nach bearbeitet werden */
  songIds: readonly number[];
  /** Bearbeitet einen Song; ein Ergebnis landet in der Fundliste. `online`: Es wurde online gefragt. */
  work: (songId: number) => Promise<{ result: T | null; online: boolean }>;
  /** Pause nach einem Song, für den online gefragt wurde */
  delayMs: number;
  /** Nach so vielen Fehlschlägen in Folge bricht der Auftrag ab. */
  maxFailures: number;
}

export class LibraryJobs {
  readonly #jobs = new Map<string, LibraryJob>();
  readonly #cancelled = new Set<string>();

  /** Startet einen Auftrag; läuft schon einer dieser Art, kommt dieser zurück. */
  start<T>(options: JobOptions<T>): LibraryJob<T> {
    this.#forgetOld();
    const running = this.latest(options.kind);
    if (running?.status === 'running') return running as LibraryJob<T>;

    const job: LibraryJob<T> = {
      id: randomBytes(9).toString('base64url'),
      kind: options.kind,
      status: 'running',
      done: 0,
      total: options.songIds.length,
      results: [],
      error: null,
      startedAt: new Date(),
      finishedAt: null,
    };
    this.#jobs.set(job.id, job);
    void this.#run(job, options);
    return job;
  }

  get(id: string): LibraryJob | undefined {
    return this.#jobs.get(id);
  }

  /** Der zuletzt gestartete Auftrag dieser Art. */
  latest(kind: LibraryJob['kind']): LibraryJob | undefined {
    return [...this.#jobs.values()].filter((job) => job.kind === kind).at(-1);
  }

  /**
   * Hält einen laufenden Auftrag an (die Funde bleiben, er endet als „cancelled“) bzw. vergisst
   * einen beendeten.
   */
  remove(id: string): boolean {
    const job = this.#jobs.get(id);
    if (!job) return false;
    if (job.status === 'running') this.#cancelled.add(id);
    else this.#jobs.delete(id);
    return true;
  }

  /** Wartet, bis kein Auftrag mehr läuft (für Tests). */
  async idle(): Promise<void> {
    while ([...this.#jobs.values()].some((job) => job.status === 'running')) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  async #run<T>(job: LibraryJob<T>, options: JobOptions<T>): Promise<void> {
    let failures = 0;
    try {
      for (const songId of options.songIds) {
        if (this.#cancelled.has(job.id)) {
          job.status = 'cancelled';
          return;
        }
        let online = true;
        try {
          const outcome = await options.work(songId);
          online = outcome.online;
          if (outcome.result !== null) job.results.push(outcome.result);
          failures = 0;
        } catch (err) {
          failures += 1;
          console.warn(`Auftrag ${job.kind}: Song ${songId} fehlgeschlagen:`, err instanceof Error ? err.message : err);
          if (failures >= options.maxFailures) {
            job.status = 'failed';
            job.error = 'Die Online-Quellen sind gerade nicht erreichbar. Was bis dahin gefunden wurde, steht unten.';
            return;
          }
        }
        job.done += 1;
        if (online && job.done < job.total) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }
      job.status = 'done';
    } finally {
      job.finishedAt = new Date();
      this.#cancelled.delete(job.id);
    }
  }

  #forgetOld(): void {
    const cutoff = Date.now() - KEEP_MS;
    for (const [id, job] of this.#jobs) {
      if (job.status !== 'running' && (job.finishedAt?.getTime() ?? 0) < cutoff) this.#jobs.delete(id);
    }
  }
}
