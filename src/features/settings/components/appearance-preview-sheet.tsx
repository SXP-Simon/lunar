import { Text, View } from 'react-native';

import { SafeSheet } from '@/components/ui/safe-sheet';

type AppearancePreviewSheetProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export function AppearancePreviewSheet({
  isOpen,
  onOpenChange,
}: AppearancePreviewSheetProps) {
  return (
    <SafeSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <SafeSheet.Portal>
        <SafeSheet.Overlay variant="blur" blurViewProps={{ intensity: 28 }} />
        <SafeSheet.Content
          backgroundClassName="bg-surface"
          contentContainerClassName="px-6 pb-8">
          <SafeSheet.Close accessibilityLabel="关闭外观预览" />
          <SafeSheet.Title className="text-xl text-foreground">
            外观预览
          </SafeSheet.Title>
          <SafeSheet.Description className="mt-1 text-sm text-muted">
            当前主题下的阅读页面示意
          </SafeSheet.Description>

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
        </SafeSheet.Content>
      </SafeSheet.Portal>
    </SafeSheet>
  );
}
