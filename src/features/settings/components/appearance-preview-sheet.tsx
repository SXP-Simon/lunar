import { BottomSheet } from 'heroui-native/bottom-sheet';
import { Text, View } from 'react-native';

type AppearancePreviewSheetProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export function AppearancePreviewSheet({
  isOpen,
  onOpenChange,
}: AppearancePreviewSheetProps) {
  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay variant="blur" blurViewProps={{ intensity: 28 }} />
        <BottomSheet.Content
          backgroundClassName="bg-surface"
          contentContainerClassName="px-6 pb-8">
          <BottomSheet.Close accessibilityLabel="关闭外观预览" />
          <BottomSheet.Title className="text-xl text-foreground">外观预览</BottomSheet.Title>
          <BottomSheet.Description className="mt-1 text-sm text-muted">
            当前主题下的阅读页面示意
          </BottomSheet.Description>

          <View className="mt-6 items-center rounded-3xl bg-surface-secondary px-6 py-7">
            <View className="h-[230px] w-[164px] rounded-md border border-border bg-surface px-5 py-7">
              <Text className="font-serif text-xs font-semibold tracking-[2px] text-foreground">
                第一章
              </Text>
              <View className="mt-8 h-1.5 w-4/5 rounded-full bg-foreground" />
              <View className="mt-5 h-1 w-full rounded-full bg-muted opacity-40" />
              <View className="mt-3 h-1 w-3/4 rounded-full bg-muted opacity-40" />
              <View className="mt-3 h-1 w-11/12 rounded-full bg-muted opacity-40" />
            </View>
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
