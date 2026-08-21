import { BottomSheet } from 'heroui-native/bottom-sheet';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ComponentRef,
} from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppTabBarHeight } from './app-tabs';

type SafeSheetRootProps = ComponentPropsWithoutRef<typeof BottomSheet>;

export type SafeSheetContentProps = Omit<
  ComponentPropsWithoutRef<typeof BottomSheet.Content>,
  'bottomInset'
> & {
  bottomSpacing?: number;
};

const SafeSheetRoot = forwardRef<ComponentRef<typeof BottomSheet>, SafeSheetRootProps>(
  (props, ref) => <BottomSheet ref={ref} {...props} />,
);

const SafeSheetContent = forwardRef<
  ComponentRef<typeof BottomSheet.Content>,
  SafeSheetContentProps
>(({ bottomSpacing = 0, ...props }, ref) => {
  const insets = useSafeAreaInsets();

  return (
    <BottomSheet.Content
      ref={ref}
      {...props}
      bottomInset={AppTabBarHeight + insets.bottom + bottomSpacing}
    />
  );
});

SafeSheetRoot.displayName = 'SafeSheet';
SafeSheetContent.displayName = 'SafeSheet.Content';

export const SafeSheet = Object.assign(SafeSheetRoot, {
  Trigger: BottomSheet.Trigger,
  Portal: BottomSheet.Portal,
  Overlay: BottomSheet.Overlay,
  Content: SafeSheetContent,
  Background: BottomSheet.Background,
  Close: BottomSheet.Close,
  Title: BottomSheet.Title,
  Description: BottomSheet.Description,
});
