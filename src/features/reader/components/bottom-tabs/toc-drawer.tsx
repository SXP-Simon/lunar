import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { BottomSheet } from 'heroui-native/bottom-sheet';
import { Button } from 'heroui-native/button';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ReaderTocEntry } from '@/reader';
import type { LunarReaderRuntime } from '@/reader/native';
import { getReaderBottomTabBarInset } from './constants';

interface TocDrawerProps {
  readonly isOpen: boolean;
  readonly onOpenChange: (value: boolean) => void;
  readonly runtime: LunarReaderRuntime;
  readonly toc: readonly ReaderTocEntry[];
}

interface FlatTocEntry extends ReaderTocEntry {
  readonly depth: number;
}

export function TocDrawer({ isOpen, onOpenChange, runtime, toc }: TocDrawerProps) {
  const insets = useSafeAreaInsets();
  const bottomInset = getReaderBottomTabBarInset(insets.bottom);
  const entries = useMemo(() => isOpen ? flattenToc(toc) : [], [isOpen, toc]);

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal unstable_accessibilityContainerViewIsModal>
        <BottomSheet.Overlay style={{ bottom: bottomInset }} />
        <BottomSheet.Content
          backgroundClassName="rounded-t-3xl"
          bottomInset={bottomInset}
          contentContainerClassName="h-full px-0"
          detached
          enableDynamicSizing={false}
          enableOverDrag={false}
          snapPoints={['62%', '88%']}>
          <View className="flex-row items-center justify-between border-b border-border px-5 pb-3">
            <View className="min-w-0 flex-1 gap-1 pr-3">
              <BottomSheet.Title className="text-xl text-foreground">目录</BottomSheet.Title>
              <BottomSheet.Description className="text-sm text-muted">
                {entries.length > 0 ? `共 ${entries.length} 项` : '这本书没有提供目录'}
              </BottomSheet.Description>
            </View>
            <BottomSheet.Close accessibilityLabel="关闭目录" />
          </View>
          <BottomSheetScrollView
            contentContainerClassName="gap-1 px-3"
            showsVerticalScrollIndicator={false}
            style={{ flex: 1 }}>
            {entries.map((entry, index) => (
              <Button
                key={`${entry.href}:${index}`}
                accessibilityLabel={`前往${entry.label}`}
                className="h-auto min-h-12 justify-start rounded-xl px-3"
                onPress={() => {
                  void runtime.goToToc(entry.href).then(() => onOpenChange(false));
                }}
                style={{ marginLeft: Math.min(entry.depth, 4) * 14 }}
                variant="ghost">
                <Button.Label className="flex-1 text-left" numberOfLines={2}>
                  {entry.label}
                </Button.Label>
              </Button>
            ))}
            {entries.length === 0 && (
              <Text className="px-4 py-8 text-center text-muted">这本书没有提供目录。</Text>
            )}
          </BottomSheetScrollView>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

function flattenToc(entries: readonly ReaderTocEntry[], depth = 0): FlatTocEntry[] {
  const flattened: FlatTocEntry[] = [];
  const visited = new Set<ReaderTocEntry>();
  const stack = entries.slice().reverse().map((entry) => ({ entry, depth }));
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current.entry)) continue;
    visited.add(current.entry);
    flattened.push({ ...current.entry, depth: current.depth });
    for (let index = current.entry.children.length - 1; index >= 0; index -= 1) {
      stack.push({ entry: current.entry.children[index], depth: current.depth + 1 });
    }
  }
  return flattened;
}
