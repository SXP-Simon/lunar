import { IconTabBarHeight } from '@/components/ui/icon-tab-bar';

export const ReaderBottomTabBarHeight = IconTabBarHeight;

export function getReaderBottomTabBarInset(bottomSafeArea: number): number {
  return bottomSafeArea + ReaderBottomTabBarHeight;
}
