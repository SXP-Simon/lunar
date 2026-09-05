import { SymbolView } from 'expo-symbols';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import { useTranslation } from '@/i18n';
import { BookmarkPullThreshold } from '../domain/bookmark-pull';

export function ReaderBookmarkIndicator({ distance, topInset, bookmarked }: {
  readonly distance: SharedValue<number>;
  readonly topInset: number;
  readonly bookmarked: boolean;
}) {
  const { t } = useTranslation();
  const foreground = useCSSVariable('--color-foreground') as string;
  const muted = useCSSVariable('--color-muted') as string;
  const pullingStyle = useAnimatedStyle(() => ({ opacity: distance.value > 0 && distance.value < BookmarkPullThreshold ? 1 : 0 }));
  const readyStyle = useAnimatedStyle(() => ({ opacity: distance.value >= BookmarkPullThreshold ? 1 : 0 }));
  return (
    <View pointerEvents="none" className="absolute left-0 right-0 top-0" style={{ paddingTop: topInset + 8 }}>
      <Animated.View className="absolute right-5 flex-row items-center gap-2" style={[{ top: topInset + 8 }, pullingStyle]}>
        <Text className="text-sm text-muted">{t(bookmarked ? 'reader.bookmarkExists' : 'reader.pullToBookmark')}</Text>
        <SymbolView name={{ ios: 'bookmark', android: 'bookmark_border', web: 'bookmark_border' }} size={30} tintColor={muted} />
      </Animated.View>
      <Animated.View className="absolute right-5 flex-row items-center gap-2" style={[{ top: topInset + 8 }, readyStyle]}>
        <Text className="text-sm text-foreground">{t(bookmarked ? 'reader.bookmarkExists' : 'reader.releaseToBookmark')}</Text>
        <SymbolView name={{ ios: 'bookmark.fill', android: 'bookmark', web: 'bookmark' }} size={30} tintColor={foreground} />
      </Animated.View>
    </View>
  );
}
