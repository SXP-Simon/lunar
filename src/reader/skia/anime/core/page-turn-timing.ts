import type { ReaderPageAnimationStyle } from './page-turn-types';

export const AUTOMATIC_PAGE_TURN_DURATION_MS = 947;
export const PAGE_TURN_DURATION_MS = AUTOMATIC_PAGE_TURN_DURATION_MS;
export const PAGE_TURN_GESTURE_SETTLE_DURATION_MS = 520;
export const PAGE_TURN_REVERSE_DURATION_MS = 854;
export const PAGE_TURN_REVERT_DURATION_MS = 720;
export const AUTOMATIC_PLANAR_PAGE_TURN_MIN_DURATION_MS = 100;

const SLIDE_RELEASE_MIN_SPEED_PX_PER_MS = 0.2;
const SLIDE_RELEASE_MAX_SPEED_PX_PER_MS = 1;
const SLIDE_MAX_EASE_OUT_BLEND = 1 / 3;

export function getSlidePageTurnEasing(
  fromProgress: number,
  targetProgress: 0 | 1,
  releaseVelocityPxPerMs = 0,
): (progress: number) => number {
  const towardTarget = releaseVelocityPxPerMs * (targetProgress - fromProgress) > 0;
  const releaseBoost = towardTarget
    ? clampUnit(
        (Math.abs(releaseVelocityPxPerMs) - SLIDE_RELEASE_MIN_SPEED_PX_PER_MS)
          / (SLIDE_RELEASE_MAX_SPEED_PX_PER_MS - SLIDE_RELEASE_MIN_SPEED_PX_PER_MS),
      )
    : 0;
  const easeOutBlend = releaseBoost * SLIDE_MAX_EASE_OUT_BLEND;

  return (progress: number): number => {
    'worklet';
    const time = Math.min(1, Math.max(0, progress));
    const easeInOutQuad = time < 0.5
      ? 2 * time * time
      : 1 - 2 * (1 - time) * (1 - time);
    const easeOutCubic = 1 - (1 - time) ** 3;
    return easeInOutQuad * (1 - easeOutBlend) + easeOutCubic * easeOutBlend;
  };
}

export function getReaderPageTurnDuration(
  animationStyle: ReaderPageAnimationStyle,
  releaseVelocity = 0,
  animationDuration = 360,
  incomingPageLanding = false,
): number {
  const style = resolveReaderPageAnimationStyle(animationStyle);
  if (style === 'page') {
    return incomingPageLanding ? PAGE_TURN_REVERSE_DURATION_MS : PAGE_TURN_DURATION_MS;
  }
  const releaseSpeed = Math.min(6, Math.max(0, releaseVelocity));
  const releaseBoost = Math.min(0.55, releaseSpeed * 0.08);
  const baseDuration = clampPageTurnDuration(animationDuration);
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
      : PAGE_TURN_GESTURE_SETTLE_DURATION_MS
    : clampPageTurnDuration(animationDuration);
  const minimumDuration = style === 'page'
    ? targetProgress === 0 ? 220 : 160
    : targetProgress === 0 ? 180 : 90;
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

export function getAutomaticPlanarPageTurnDuration(
  animationStyle: ReaderPageAnimationStyle,
  queuedTurnCount: number,
  fromProgress = 0,
  animationDuration = 360,
): number {
  const queuedTurns = Math.max(1, Math.floor(queuedTurnCount));
  const baseDuration = getReaderPageTurnDuration(
    animationStyle,
    0,
    animationDuration,
  );
  const turnDuration = Math.max(
    AUTOMATIC_PLANAR_PAGE_TURN_MIN_DURATION_MS,
    Math.round(baseDuration / Math.min(4, queuedTurns)),
  );
  return Math.max(
    32,
    Math.round(turnDuration * (1 - clampUnit(fromProgress))),
  );
}

export function getReaderPageTurnHandoffProgress(
  settling: boolean,
  settleTo?: 0 | 1,
): 0 | 1 | undefined {
  return settling ? settleTo ?? 1 : undefined;
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
