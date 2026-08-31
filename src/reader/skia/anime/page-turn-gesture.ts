/** Finger position at which the hinge starts bending. A larger value makes
 * the bend appear after a shorter physical drag. */
export const MIN_PRESSED_EDGE_X = 0.2;
export const GESTURE_LIFT_START_FINGER_X = 0.42;
/** Visual progress reaches the full sheet profile after 0.38 page widths. */
export const VISUAL_TURN_TRAVEL = 0.38;
export const GESTURE_HINGE_BEND_AMPLITUDE = 2.1266855842119465;
export const GESTURE_HINGE_ROTATION = 0.4 * 0.997;
export const GESTURE_HINGE_CHORD_X = MIN_PRESSED_EDGE_X / Math.cos(GESTURE_HINGE_ROTATION);
/** Commit still requires a longer travel than the visual curl trigger. */
export const GESTURE_COMMIT_TRAVEL = 0.58;
export const DEFAULT_GESTURE_COMMIT_THRESHOLD = 0.78;

export function clampUnit(value: number): number {
  'worklet';
  return Math.min(1, Math.max(0, value));
}

export function pageTurnStartBookXForTouch(
  localX: number,
  direction: 1 | -1,
  pageWidth: number,
): number {
  'worklet';
  const normalized = clampUnit(localX / Math.max(1, pageWidth));
  return direction === 1 ? normalized : 1 - normalized;
}

export function bookXForGestureTravel(
  startBookX: number,
  translationX: number,
  direction: 1 | -1,
  pageWidth: number,
): number {
  'worklet';
  const signedTravel = direction === 1 ? translationX : -translationX;
  return Math.min(1, Math.max(-1, startBookX + signedTravel / Math.max(1, pageWidth)));
}

export function anchoredGestureFingerX(startBookX: number, currentBookX: number): number {
  'worklet';
  return Math.min(1, Math.max(-1, 1 + currentBookX - startBookX));
}

export function gestureLiftRotationForFingerX(fingerX: number): number {
  'worklet';
  if (fingerX <= MIN_PRESSED_EDGE_X) return GESTURE_HINGE_ROTATION;
  const progress = clampUnit((GESTURE_LIFT_START_FINGER_X - fingerX) / (GESTURE_LIFT_START_FINGER_X - MIN_PRESSED_EDGE_X));
  return GESTURE_HINGE_ROTATION * progress;
}

export function gesturePressedChordForFingerX(
  fingerX: number,
  rotation = gestureLiftRotationForFingerX(fingerX),
): number {
  'worklet';
  if (fingerX <= MIN_PRESSED_EDGE_X) return GESTURE_HINGE_CHORD_X;
  return Math.min(1, Math.max(MIN_PRESSED_EDGE_X, fingerX / Math.max(0.000001, Math.cos(rotation))));
}

export function postHingeTurnProgressForFingerX(
  fingerX: number,
  startBookX: number,
): number {
  'worklet';
  const safeFingerX = Math.min(1, Math.max(-1, fingerX));
  const safeStart = Math.min(1, Math.max(0, startBookX));
  const linear = clampUnit((MIN_PRESSED_EDGE_X - safeFingerX) / (MIN_PRESSED_EDGE_X + safeStart));
  if (linear <= 0 || linear >= 1) return linear;
  const desiredRotation = GESTURE_HINGE_ROTATION + (Math.PI - GESTURE_HINGE_ROTATION) * linear;
  const swingAngle = Math.max(0, Math.PI - (GESTURE_HINGE_ROTATION + GESTURE_HINGE_BEND_AMPLITUDE));
  const swingProgress = swingAngle / Math.PI;
  const landingStart = swingProgress / Math.max(0.000001, swingProgress + 1);
  const landingRotation = Math.PI - GESTURE_HINGE_BEND_AMPLITUDE;
  if (desiredRotation <= landingRotation && swingAngle > 1e-9) {
    return landingStart * ((desiredRotation - GESTURE_HINGE_ROTATION) / swingAngle);
  }
  const retention = clampUnit((Math.PI - desiredRotation) / GESTURE_HINGE_BEND_AMPLITUDE);
  const remaining = retention ** (1 / (1 + 7 / 14));
  return landingStart + (1 - remaining) * (1 - landingStart);
}

/** Visual curl starts before the commit score is reached. */
export function visualTurnProgressForFingerX(fingerX: number): number {
  'worklet';
  return clampUnit((1 - Math.min(1, Math.max(-1, fingerX))) / VISUAL_TURN_TRAVEL);
}

export function turnCommitScore(
  fingerX: number,
  throwVelocity: number,
  throwAcceleration: number,
  pageWeight = 1,
): number {
  'worklet';
  const distance = Math.min(1.2, Math.max(0, (1 - fingerX) / GESTURE_COMMIT_TRAVEL));
  const velocity = Math.min(3.2, Math.max(0, throwVelocity)) * 0.18;
  const acceleration = Math.min(10, Math.max(0, throwAcceleration)) * 0.035;
  return (distance + velocity + acceleration) / Math.min(6, Math.max(0.1, pageWeight));
}

export function shouldCommitTurn(
  fingerX: number,
  throwVelocity: number,
  throwAcceleration: number,
): boolean {
  'worklet';
  return turnCommitScore(fingerX, throwVelocity, throwAcceleration) >= DEFAULT_GESTURE_COMMIT_THRESHOLD;
}
