import type { ReaderLocator } from '../contracts';
import type { RitoArtifactRequest } from './rito-native';

export function toRitoSavedLocator(locator: ReaderLocator, href: string): RitoArtifactRequest['locator'] {
  const point = locator.sourcePoint ?? locator.sourceRange?.start;
  return {
    href,
    anchorId: point ? undefined : locator.anchorId,
    sourcePoint: point ? { nodePath: point.nodePath, textOffset: BigInt(point.textOffset) } : undefined,
    sourceRange: locator.sourceRange ? {
      start: { nodePath: locator.sourceRange.start.nodePath, textOffset: BigInt(locator.sourceRange.start.textOffset) },
      end: { nodePath: locator.sourceRange.end.nodePath, textOffset: BigInt(locator.sourceRange.end.textOffset) },
    } : undefined,
    progression: point || locator.anchorId ? undefined : locator.chapterProgress,
  };
}
