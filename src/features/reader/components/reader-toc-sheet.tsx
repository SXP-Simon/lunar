import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { BottomSheet } from 'heroui-native/bottom-sheet';
import { Button } from 'heroui-native/button';
import { Text, View } from 'react-native';

import type { ReaderTocEntry } from '@/reader';
import type { LunarReaderRuntime } from '@/reader/native';

interface ReaderTocSheetProps {
  readonly isOpen: boolean;
  readonly onOpenChange: (value: boolean) => void;
  readonly runtime: LunarReaderRuntime;
  readonly toc: readonly ReaderTocEntry[];
}

interface FlatTocEntry extends ReaderTocEntry {
  readonly depth: number;
}

export function ReaderTocSheet({
  isOpen,
  onOpenChange,
  runtime,
  toc,
}: ReaderTocSheetProps) {
  const entries = flattenToc(toc);

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal unstable_accessibilityContainerViewIsModal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          snapPoints={['58%', '88%']}
          enableDynamicSizing={false}
          enableOverDrag={false}
          contentContainerClassName="h-full px-0">
          <View className="flex-row items-center justify-between px-5 pb-3">
            <View className="gap-1">
              <BottomSheet.Title>目录</BottomSheet.Title>
              <BottomSheet.Description>
                {entries.length > 0 ? `共 ${entries.length} 项` : '这本书没有提供目录'}
              </BottomSheet.Description>
            </View>
            <BottomSheet.Close accessibilityLabel="关闭目录" />
          </View>
          <BottomSheetScrollView
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40 }}>
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
              <Text className="px-4 py-8 text-center text-muted">
                仍可使用阅读进度滑块选择页面
              </Text>
            )}
          </BottomSheetScrollView>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

function flattenToc(entries: readonly ReaderTocEntry[], depth = 0): FlatTocEntry[] {
  return entries.flatMap((entry) => [
    { ...entry, depth },
    ...flattenToc(entry.children, depth + 1),
  ]);
}
