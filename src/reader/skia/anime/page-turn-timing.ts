import type { ReaderPageAnimationStyle } from './page-transition';

export const PAGE_TURN_DURATION_MS = 680;
export const PAGE_TURN_REVERT_DURATION_MS = 720;

export function getReaderPageTurnDuration(
  animationStyle: ReaderPageAnimationStyle,
  releaseVelocity = 0,
  animationDuration = 360,
): number {
  const style = resolveReaderPageAnimationStyle(animationStyle);
  const releaseSpeed = Math.min(6, Math.max(0, releaseVelocity));
  const releaseBoost = style === 'page'
    ? Math.min(0.22, releaseSpeed * 0.035)
    : Math.min(0.55, releaseSpeed * 0.08);
  const baseDuration = style === 'page'
    ? PAGE_TURN_DURATION_MS
    : clampPageTurnDuration(animationDuration);
  return Math.max(140, Math.round(baseDuration * (1 - releaseBoost)));
}

export function getReaderPageTurnSettleDuration(
  animationStyle: ReaderPageAnimationStyle,
  fromProgress: number,
  targetProgress: 0 | 1,
  releaseVelocity = 0,
  animationDuration = 360,
): number {
  const style = resolveReaderPageAnimationStyle(animationStyle);
  const distance = Math.abs(clampUnit(targetProgress) - clampUnit(fromProgress));
  const fullDuration = style === 'page'
    ? targetProgress === 0
      ? PAGE_TURN_REVERT_DURATION_MS
      : PAGE_TURN_DURATION_MS
    : clampPageTurnDuration(animationDuration);
  const minimumDuration = style === 'page'
    ? targetProgress === 0 ? 220 : 160
    : 90;
  const towardTarget = releaseVelocity * (targetProgress - fromProgress) > 0;
  const releaseSpeed = towardTarget
    ? Math.min(6, Math.abs(releaseVelocity))
    : 0;
  const releaseBoost = style === 'page'
    ? Math.min(0.22, releaseSpeed * 0.035)
    : Math.min(0.5, releaseSpeed * 0.08);
  return Math.max(
    minimumDuration,
    Math.round(fullDuration * distance * (1 - releaseBoost)),
  );
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

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}
