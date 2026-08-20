import type { ReadingPosition as RitoReadingPosition } from '@ritojs/core';

import type { ReaderPosition } from '../contracts';

export function toReaderPosition(position: RitoReadingPosition): ReaderPosition {
  return {
    locator: position.locator,
    progression: position.progress,
    pageIndex: position.projection.pageIndex,
    spreadIndex: position.projection.spreadIndex,
    timestamp: position.timestamp,
  };
}

export function toRitoReadingPosition(position: ReaderPosition): RitoReadingPosition {
  return {
    locator: position.locator,
    progress: position.progression,
    projection: {
      pageIndex: position.pageIndex,
      spreadIndex: position.spreadIndex,
    },
    timestamp: position.timestamp,
  };
}
