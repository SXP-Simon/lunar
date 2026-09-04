import type { ReaderPageAnimationStyle } from '../core/page-turn-types';
import type { ReaderPageTurnEffect } from '../core/page-turn-effect';
import { coverPageTurnEffect } from './cover/strategy';
import { curlPageTurnEffect } from './curl/strategy';
import { slidePageTurnEffect } from './slide/strategy';

const PAGE_TURN_EFFECTS: Readonly<Record<ReaderPageAnimationStyle, ReaderPageTurnEffect>> = {
  cover: coverPageTurnEffect,
  overlay: coverPageTurnEffect,
  page: curlPageTurnEffect,
  pageCurl: curlPageTurnEffect,
  simulation: curlPageTurnEffect,
  slide: slidePageTurnEffect,
};

export function getReaderPageTurnEffect(
  style: ReaderPageAnimationStyle,
): ReaderPageTurnEffect {
  return PAGE_TURN_EFFECTS[style];
}
