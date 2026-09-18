import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useTranslation } from '@/i18n';
import { BookmarkPullThreshold } from '../domain/bookmark-pull';

export function ReaderBookmarkIndicator({ distance, pullBookmarked, topInset }: {
  readonly distance: SharedValue<number>;
  readonly pullBookmarked: SharedValue<boolean>;
  readonly topInset: number;
}) {
  const { t } = useTranslation();
  const addPullingStyle = useAnimatedStyle(() => ({
    opacity: distance.value >= topInset + 56 && distance.value < BookmarkPullThreshold && !pullBookmarked.value ? 1 : 0,
  }), [topInset]);
  const removePullingStyle = useAnimatedStyle(() => ({
    opacity: distance.value >= topInset + 56 && distance.value < BookmarkPullThreshold && pullBookmarked.value ? 1 : 0,
  }), [topInset]);
  const addReadyStyle = useAnimatedStyle(() => ({
    opacity: distance.value >= Math.max(topInset + 56, BookmarkPullThreshold) && !pullBookmarked.value ? 1 : 0,
  }), [topInset]);
  const removeReadyStyle = useAnimatedStyle(() => ({
    opacity: distance.value >= Math.max(topInset + 56, BookmarkPullThreshold) && pullBookmarked.value ? 1 : 0,
  }), [topInset]);

  return (
    <View pointerEvents="none" className="absolute inset-x-0 top-0 z-10 h-0">
      <Animated.View className="absolute right-16" style={[{ top: topInset + 24 }, addPullingStyle]}>
        <Text className="text-base text-foreground">{t('reader.pullToBookmark')}</Text>
      </Animated.View>
      <Animated.View className="absolute right-16" style={[{ top: topInset + 24 }, removePullingStyle]}>
        <Text className="text-base text-foreground">{t('reader.pullToRemoveBookmark')}</Text>
      </Animated.View>
      <Animated.View className="absolute right-16" style={[{ top: topInset + 24 }, addReadyStyle]}>
        <Text className="text-base text-foreground">{t('reader.releaseToBookmark')}</Text>
      </Animated.View>
      <Animated.View className="absolute right-16" style={[{ top: topInset + 24 }, removeReadyStyle]}>
        <Text className="text-base text-foreground">{t('reader.releaseToRemoveBookmark')}</Text>
      </Animated.View>
    </View>
  );
}
