import type { RitoReaderPrimitiveList } from '@modules/rito-rn/src/protocol/rito2/reader-session-primitive';

import type { ReaderDisplayList, ReaderResolvedPrimitiveList } from '../contracts';

/** Keeps Rito's device-resolved primitives with their logical page dimensions. */
export function toReaderDisplayList(
  displayList: RitoReaderPrimitiveList,
  width: number,
  height: number,
): ReaderDisplayList {
  return { width, height, resolvedPrimitives: displayList as ReaderResolvedPrimitiveList };
}
