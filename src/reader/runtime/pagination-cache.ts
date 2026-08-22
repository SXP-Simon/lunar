import type { ReaderWorkletOpenResult } from './worklet-pagination-backend';

export interface ReaderPaginationSnapshot extends ReaderWorkletOpenResult {
  readonly cacheKey: string;
  readonly createdAt: number;
}

export interface ReaderPaginationSnapshotCache {
  get(cacheKey: string): ReaderPaginationSnapshot | undefined;
  set(snapshot: ReaderPaginationSnapshot): void;
  delete(cacheKey: string): void;
  clear(): void;
}

export class MemoryReaderPaginationSnapshotCache implements ReaderPaginationSnapshotCache {
  private readonly entries = new Map<string, ReaderPaginationSnapshot>();

  constructor(private readonly maxEntries = 2) {}

  get(cacheKey: string): ReaderPaginationSnapshot | undefined {
    const snapshot = this.entries.get(cacheKey);
    if (!snapshot) {
      return undefined;
    }
    this.entries.delete(cacheKey);
    this.entries.set(cacheKey, snapshot);
    return snapshot;
  }

  set(snapshot: ReaderPaginationSnapshot): void {
    this.entries.delete(snapshot.cacheKey);
    this.entries.set(snapshot.cacheKey, snapshot);
    while (this.entries.size > this.maxEntries) {
      const key = this.entries.keys().next().value;
      if (key === undefined) {
        break;
      }
      this.entries.delete(key);
    }
  }

  delete(cacheKey: string): void {
    this.entries.delete(cacheKey);
  }

  clear(): void {
    this.entries.clear();
  }
}

export function validatePaginationSnapshot(snapshot: ReaderPaginationSnapshot): boolean {
  return (
    Boolean(snapshot.cacheKey) &&
    Number.isInteger(snapshot.totalPages) &&
    snapshot.totalPages >= 0 &&
    Number.isInteger(snapshot.totalSpreads) &&
    snapshot.totalSpreads >= 0 &&
    Array.isArray(snapshot.tocTargets) &&
    snapshot.tocTargets.every(
      ([href, spreadIndex]) => typeof href === 'string' && Number.isInteger(spreadIndex),
    )
  );
}
