import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { SymbolView } from 'expo-symbols';
import { BottomSheet } from 'heroui-native/bottom-sheet';
import { Button } from 'heroui-native/button';
import { useThemeColor } from 'heroui-native/hooks';
import { useToast } from 'heroui-native/toast';
import { useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '@/i18n';
import type { ReaderLocator, ReaderRuntime, ReaderTocEntry } from '@/reader';
import type { ReaderBookmark } from '../../domain/reader-bookmark';
import type { ReaderHighlight } from '../../domain/reader-highlight';
import { getReaderBottomTabBarInset } from './constants';
import { useDrawerNavigation } from '../../hooks/use-drawer-navigation';

interface MarksDrawerProps {
  readonly isOpen: boolean;
  readonly onOpenChange: (value: boolean) => void;
  readonly runtime: ReaderRuntime;
  readonly toc: readonly ReaderTocEntry[];
  readonly bookmarks: readonly ReaderBookmark[];
  readonly highlights: readonly ReaderHighlight[];
  readonly bookmarksLoaded: boolean;
  readonly highlightsLoaded: boolean;
  readonly bookmarksError?: unknown;
  readonly highlightsError?: unknown;
  readonly onRemoveBookmark: (id: string) => Promise<void>;
  readonly onNavigated: () => void;
}

interface MarkEntry {
  readonly id: string;
  readonly locator: ReaderLocator;
  readonly title: string;
  readonly text: string;
  readonly createdAt: number;
}

export function MarksDrawer(props: MarksDrawerProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  const bottomInset = getReaderBottomTabBarInset(insets.bottom);
  const dangerForeground = useThemeColor('danger-foreground');
  const [tab, setTab] = useState<'bookmarks' | 'highlights'>('bookmarks');
  const [removing, setRemoving] = useState(false);
  const pending = useRef(false);
  const navigation = useDrawerNavigation({
    onOpenChange: props.onOpenChange,
    onNavigated: props.onNavigated,
    onFailure: () => toast.show({ variant: 'danger', label: t('reader.markNavigationFailed') }),
  });
  const busy = removing || navigation.busy;
  const entries = useMemo<MarkEntry[]>(() => {
    if (tab === 'bookmarks') return props.bookmarks.map((bookmark) => ({
      ...bookmark, title: bookmark.label || t('reader.bookmark'),
    }));
    const titles = chapterTitles(props.toc);
    return props.highlights.map((highlight) => ({
      id: highlight.id,
      title: titles.get(highlight.href) ?? t('reader.highlightSelection'),
      text: highlight.text,
      createdAt: highlight.createdAt,
      locator: { spineIdref: highlight.href, manifestHref: highlight.href, chapterProgress: 0,
        sourcePoint: highlight.sourceRange.start, sourceRange: highlight.sourceRange },
    })).sort((a, b) => b.createdAt - a.createdAt);
  }, [props.bookmarks, props.highlights, props.toc, t, tab]);
  const loaded = tab === 'bookmarks' ? props.bookmarksLoaded : props.highlightsLoaded;
  const error = tab === 'bookmarks' ? props.bookmarksError : props.highlightsError;

  function navigate(entry: MarkEntry) {
    if (pending.current) return;
    navigation.requestNavigation(() => props.runtime.goToLocator(entry.locator));
  }

  async function remove(id: string) {
    if (pending.current || navigation.isPending()) return;
    pending.current = true;
    setRemoving(true);
    try {
      await props.onRemoveBookmark(id);
      toast.show({ variant: 'success', label: t('reader.bookmarkRemoved') });
    } catch {
      toast.show({ variant: 'danger', label: t('reader.bookmarkSaveFailed') });
    } finally { pending.current = false; setRemoving(false); }
  }

  return (
    <BottomSheet isOpen={props.isOpen} onOpenChange={props.onOpenChange}>
      <BottomSheet.Portal disableFullWindowOverlay unstable_accessibilityContainerViewIsModal>
        <BottomSheet.Overlay style={{ bottom: bottomInset }} />
        <BottomSheet.Content backgroundClassName="rounded-t-3xl" bottomInset={bottomInset}
          contentContainerClassName="h-full flex-1 p-0!" detached enableDynamicSizing={false}
          enableOverDrag={false} snapPoints={['62%', '88%']}>
          <View className="gap-3 border-b border-border px-5 pb-3">
            <BottomSheet.Title className="text-xl text-foreground">{t('reader.marks')}</BottomSheet.Title>
            <View className="flex-row gap-2">
              {(['bookmarks', 'highlights'] as const).map((key) => (
                <Button key={key} className="flex-1" size="sm" variant={tab === key ? 'secondary' : 'ghost'}
                  accessibilityRole="tab" accessibilityState={{ selected: tab === key }}
                  onPress={() => setTab(key)}>
                  <Button.Label>{t(key === 'bookmarks' ? 'reader.bookmarksCount' : 'reader.highlightsCount', {
                    count: key === 'bookmarks' ? props.bookmarks.length : props.highlights.length,
                  })}</Button.Label>
                </Button>
              ))}
            </View>
          </View>
          <BottomSheetFlatList<MarkEntry>
            className="flex-1"
            data={entries} keyExtractor={(item: MarkEntry) => item.id}
            contentContainerClassName="px-3 pb-6" showsVerticalScrollIndicator={false}
            renderItem={({ item }: { item: MarkEntry }) => {
              const content = (
                <Button className="h-auto min-h-20 w-full justify-start rounded-none px-3 py-4"
                  variant="ghost" isDisabled={busy} accessibilityLabel={t('reader.goToMark', { text: item.text || item.title })}
                  onPress={() => void navigate(item)}>
                  <View className="flex-1 gap-2">
                    <Text className="text-xs text-muted" numberOfLines={1}>{item.title}</Text>
                    <Text className="text-base leading-6 text-foreground" numberOfLines={3}>{item.text || item.title}</Text>
                    <Text className="text-xs text-muted">{new Date(item.createdAt).toLocaleDateString()}</Text>
                  </View>
                </Button>
              );
              if (tab === 'highlights') {
                return <View className="border-b border-border">{content}</View>;
              }
              return (
                <View className="overflow-hidden border-b border-border">
                  <ReanimatedSwipeable
                    dragOffsetFromRightEdge={12}
                    enabled={!busy}
                    enableTrackpadTwoFingerGesture
                    overshootRight={false}
                    rightThreshold={40}
                    renderRightActions={(_progress, _translation, swipeableMethods) => (
                      <Button
                        accessibilityLabel={t('reader.removeBookmark', { title: item.title })}
                        className="h-full w-20 self-stretch rounded-none px-0"
                        isDisabled={busy}
                        onPress={() => {
                          swipeableMethods.close();
                          void remove(item.id);
                        }}
                        size="sm"
                        variant="danger">
                        <SymbolView
                          name={{ ios: 'trash', android: 'delete', web: 'delete' }}
                          size={22}
                          tintColor={dangerForeground}
                        />
                      </Button>
                    )}>
                    <View className="bg-surface">{content}</View>
                  </ReanimatedSwipeable>
                </View>
              );
            }}
            ListEmptyComponent={<Text className="px-5 py-10 text-center leading-6 text-muted">{
              error ? t(tab === 'bookmarks' ? 'reader.bookmarkLoadFailed' : 'reader.highlightLoadFailed')
                : !loaded ? t('reader.loadingMarks') : t(tab === 'bookmarks' ? 'reader.noBookmarks' : 'reader.noHighlights')
            }</Text>}
          />
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

function chapterTitles(toc: readonly ReaderTocEntry[]): Map<string, string> {
  const titles = new Map<string, string>();
  const seen = new Set<ReaderTocEntry>();
  const stack = [...toc].reverse();
  while (stack.length) {
    const entry = stack.pop()!;
    if (seen.has(entry)) continue;
    seen.add(entry);
    const href = entry.href.split('#', 1)[0];
    if (!titles.has(href)) titles.set(href, entry.label);
    stack.push(...[...entry.children].reverse());
  }
  return titles;
}
