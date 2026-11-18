import { readJson, writeJsonAtomic } from '../config';

/** Bounded set of recently processed event ids (at-least-once delivery ⇒ dedupe on our side). */
export class SeenIds {
  private readonly order: string[];
  private readonly set: Set<string>;

  constructor(
    initial: string[] = [],
    private readonly capacity = 2000,
  ) {
    this.order = initial.slice(-capacity);
    this.set = new Set(this.order);
  }

  /** Returns false when the id was already seen. */
  add(id: string): boolean {
    if (this.set.has(id)) return false;
    this.set.add(id);
    this.order.push(id);
    if (this.order.length > this.capacity) this.set.delete(this.order.shift()!);
    return true;
  }

  toJSON(): string[] {
    return [...this.order];
  }
}

export interface PersistedState {
  lastSequence: Record<string, number>;
  seenIds: string[];
}

/** Last processed sequence per team + dedupe window, persisted with a short debounce. */
export class DeliveryState {
  readonly lastSequence: Record<string, number>;
  readonly seen: SeenIds;
  private timer: NodeJS.Timeout | undefined;

  private constructor(
    private readonly file: string,
    state: PersistedState,
  ) {
    this.lastSequence = state.lastSequence;
    this.seen = new SeenIds(state.seenIds);
  }

  static async load(file: string): Promise<DeliveryState> {
    return new DeliveryState(
      file,
      await readJson<PersistedState>(file, { lastSequence: {}, seenIds: [] }),
    );
  }

  /** Returns false for duplicates. */
  accept(event: { id: string; teamId: string; sequence?: number }): boolean {
    if (!this.seen.add(event.id)) return false;
    if (event.sequence !== undefined) {
      this.lastSequence[event.teamId] = Math.max(
        this.lastSequence[event.teamId] ?? 0,
        event.sequence,
      );
    }
    this.schedulePersist();
    return true;
  }

  async flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    await writeJsonAtomic(this.file, {
      lastSequence: this.lastSequence,
      seenIds: this.seen.toJSON(),
    });
  }

  private schedulePersist() {
    this.timer ??= setTimeout(() => void this.flush(), 500);
  }
}
