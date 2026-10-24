import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { BottomSheet } from 'heroui-native/bottom-sheet';
import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

import type { ReaderExtensionPanel } from '../../extensions/reader-extensions';
import { getBarInset } from '../navigation/layout';

const PanelScrollView = withUniwind(BottomSheetScrollView);

interface ExtensionPanelProps {
  readonly panel: ReaderExtensionPanel;
  readonly isOpen: boolean;
  readonly onOpenChange: (value: boolean) => void;
}

/** Drawer chrome for a panel whose content another feature renders. */
export function ExtensionPanel({ panel, isOpen, onOpenChange }: ExtensionPanelProps) {
  const insets = useSafeAreaInsets();
  const bottomInset = getBarInset(insets.bottom);
  // Mount the content on first open and keep it through the closing animation.
  const [hasOpened, setHasOpened] = useState(isOpen);
  if (isOpen && !hasOpened) setHasOpened(true);

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal disableFullWindowOverlay unstable_accessibilityContainerViewIsModal>
        <BottomSheet.Overlay style={{ bottom: bottomInset }} />
        <BottomSheet.Content
          backgroundClassName="rounded-t-3xl bg-background dark:bg-overlay"
          bottomInset={bottomInset}
          contentContainerClassName="px-0 pb-0!"
          detached
          enableOverDrag={false}
          snapPoints={['55%', '88%']}>
          <View className="px-5 pb-2 pt-5">
            <BottomSheet.Title className="text-xl text-foreground">{panel.title}</BottomSheet.Title>
          </View>
          <PanelScrollView contentContainerClassName="px-5 pb-6">
            {hasOpened ? panel.renderContent({ close: () => onOpenChange(false) }) : null}
          </PanelScrollView>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
