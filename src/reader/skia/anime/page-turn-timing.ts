import type { ReaderPageAnimationStyle } from './page-transition';

export const PAGE_TURN_DURATION_MS = 520;

export function getReaderPageTurnDuration(
  animationStyle: ReaderPageAnimationStyle,
  releaseVelocity = 0,
  animationDuration = 360,
): number {
  const style = resolveReaderPageAnimationStyle(animationStyle);
  const releaseSpeed = Math.min(6, Math.max(0, releaseVelocity));
  const releaseBoost = style === 'page' ? 0 : Math.min(0.55, releaseSpeed * 0.08);
  const baseDuration = style === 'page'
    ? PAGE_TURN_DURATION_MS
    : clampPageTurnDuration(animationDuration);
  return Math.max(140, Math.round(baseDuration * (1 - releaseBoost)));
}

export function resolveReaderPageAnimationStyle(
  style: ReaderPageAnimationStyle,
): 'cover' | 'page' | 'slide' {
  if (style === 'overlay') return 'cover';
  if (style === 'pageCurl' || style === 'simulation') return 'page';
  return style;
}

function clampPageTurnDuration(value: number): number {
  return Number.isFinite(value) ? Math.min(1200, Math.max(120, Math.round(value))) : 360;
}
