import type { RitoReaderPrimitiveList } from '@umbrae-labs/rito-rn';

import type { ReaderDisplayList, ReaderResolvedPrimitiveList } from '../contracts';

/** Keeps Rito's device-resolved primitives with their logical page dimensions. */
export function toReaderDisplayList(
  displayList: RitoReaderPrimitiveList,
  width: number,
  height: number,
): ReaderDisplayList {
  // Assigned without a cast so a primitive Rito adds fails type checking here.
  const resolvedPrimitives: ReaderResolvedPrimitiveList = displayList;
  return { width, height, resolvedPrimitives };
}
