import { clampUnit } from '../core/page-turn-math';

export function planarTurnProgressForTranslation(
  translationX: number,
  direction: 1 | -1,
  pageWidth: number,
): number {
  'worklet';
  const distance = direction === 1 ? -translationX : translationX;
  return clampUnit(distance / Math.max(1, pageWidth));
}
