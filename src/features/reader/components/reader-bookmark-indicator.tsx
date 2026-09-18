import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useTranslation } from '@/i18n';
import { bookmarkPullPhase } from '../domain/bookmark-pull';

export function ReaderBookmarkIndicator({ distance, pullBookmarked, topInset }: {
  readonly distance: SharedValue<number>;
  readonly pullBookmarked: SharedValue<boolean>;
  readonly topInset: number;
}) {
  const { t } = useTranslation();
  const addPullingStyle = useAnimatedStyle(() => ({
    opacity: bookmarkPullPhase(distance.value) === 'pulling' && !pullBookmarked.value ? 1 : 0,
  }));
  const removePullingStyle = useAnimatedStyle(() => ({
    opacity: bookmarkPullPhase(distance.value) === 'pulling' && pullBookmarked.value ? 1 : 0,
  }));
  const addReadyStyle = useAnimatedStyle(() => ({
    opacity: bookmarkPullPhase(distance.value) === 'ready' && !pullBookmarked.value ? 1 : 0,
  }));
  const removeReadyStyle = useAnimatedStyle(() => ({
    opacity: bookmarkPullPhase(distance.value) === 'ready' && pullBookmarked.value ? 1 : 0,
  }));

  return (
    <View pointerEvents="none" className="absolute inset-x-0 top-0 z-10 h-0">
      <Animated.View className="absolute right-16" style={[{ top: topInset + 8 }, addPullingStyle]}>
        <Text className="text-sm text-muted">{t('reader.pullToBookmark')}</Text>
      </Animated.View>
      <Animated.View className="absolute right-16" style={[{ top: topInset + 8 }, removePullingStyle]}>
        <Text className="text-sm text-muted">{t('reader.pullToRemoveBookmark')}</Text>
      </Animated.View>
      <Animated.View className="absolute right-16" style={[{ top: topInset + 8 }, addReadyStyle]}>
        <Text className="text-sm text-foreground">{t('reader.releaseToBookmark')}</Text>
      </Animated.View>
      <Animated.View className="absolute right-16" style={[{ top: topInset + 8 }, removeReadyStyle]}>
        <Text className="text-sm text-foreground">{t('reader.releaseToRemoveBookmark')}</Text>
      </Animated.View>
    </View>
  );
}
