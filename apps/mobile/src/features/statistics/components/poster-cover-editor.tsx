import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';
import { Button } from 'heroui-native/button';
import { useTranslation } from '@/i18n';
import type { PosterLabels, PosterPage, PosterTile } from '../domain/poster';
import {
  DEFAULT_POSTER_CROP,
  panPosterCrop,
  posterCoverFrame,
  zoomPosterCrop,
  type PosterCrop,
} from '../domain/poster-crop';
import { clampPosterCamera, fitPosterCamera } from '../domain/poster-camera';
import { renderPoster } from '../infrastructure/poster-renderer';
import { removePosterImage, writePosterImage } from '../infrastructure/poster-image';

const StyledGestureRoot = withUniwind(GestureHandlerRootView);
type Cover = { tile: PosterTile; width: number; height: number };

// The live cover replaces only its own rectangle. Its gradient, title and author
// are drawn by the export renderer, so the editor shows the actual composition.
function LiveCover({
  cover,
  page,
  overlay,
  edits,
}: {
  cover: Cover;
  page: PosterPage;
  overlay: string;
  edits: SharedValue<Record<string, PosterCrop>>;
}) {
  const { tile, width, height } = cover;
  const style = useAnimatedStyle(() => {
    const frame = posterCoverFrame(width, height, tile.width, tile.height, edits.get()[tile.book.id]);
    return { width: frame.width, height: frame.height, left: frame.left, top: frame.top };
  });
  return (
    <View
      pointerEvents="none"
      className="absolute overflow-hidden"
      style={{ left: tile.x, top: tile.y, width: tile.width, height: tile.height }}>
      <Animated.View className="absolute" style={style}>
        <Image
          source={{ uri: tile.book.coverUri! }}
          className="h-full w-full"
          resizeMode="stretch"
          resizeMethod="scale"
        />
      </Animated.View>
      <Image
        source={{ uri: overlay }}
        className="absolute"
        resizeMode="stretch"
        resizeMethod="scale"
        style={{ width: page.width, height: page.height, left: -tile.x, top: -tile.y }}
      />
    </View>
  );
}

function PosterScene({
  page,
  labels,
  uri,
  crops,
  initialId,
  width,
  height: initialHeight,
  onApply,
  onCancel,
}: {
  page: PosterPage;
  labels: PosterLabels;
  uri: string;
  crops: Record<string, PosterCrop>;
  initialId?: string;
  width: number;
  height: number;
  onApply: (value: Record<string, PosterCrop>) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [height, setHeight] = useState(initialHeight);
  const [overlay, setOverlay] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [covers, setCovers] = useState<Cover[]>([]);
  const [active, setActive] = useState<Cover>();
  const [loading, setLoading] = useState(false);
  const request = useRef({ version: 0 });
  const edits = useSharedValue<Record<string, PosterCrop>>({ ...crops });
  const selected = useSharedValue<Cover | null>(null);
  const camera = useSharedValue(fitPosterCamera(page.width, page.height, width, height));
  const owner = useSharedValue<'idle' | 'pan' | 'pinch'>('idle');
  const target = useSharedValue<'cover' | 'page'>('page');
  const previous = useSharedValue({ x: 0, y: 0, scale: 1, pointers: 0 });
  useEffect(() => {
    camera.set(fitPosterCamera(page.width, page.height, width, height));
  }, [camera, page.width, page.height, width, height]);
  useEffect(() => {
    const pending = request.current;
    pending.version++;
    const signal = { aborted: false };
    let result: string | undefined;
    void renderPoster(page, labels, signal, undefined, true)
      .then(async (png) => {
        if (signal.aborted) return;
        result = await writePosterImage(png, 0);
        await Image.prefetch(result);
        if (signal.aborted) {
          await removePosterImage(result);
          return;
        }
        setOverlay(result);
      })
      .catch(() => {
        if (!signal.aborted) setFailed(true);
      });
    return () => {
      signal.aborted = true;
      pending.version++;
      if (result) void removePosterImage(result).catch(() => {});
    };
  }, [page, labels, revision]);

  const select = async (id: string, focus: boolean) => {
    const tile = page.tiles.find((v) => v.book.id === id && v.book.coverUri);
    if (!tile) return;
    const version = ++request.current.version;
    setLoading(true);
    try {
      const cached = covers.find((v) => v.tile.book.id === id);
      const cover = cached ?? { tile, ...(await Image.getSize(tile.book.coverUri!)) };
      if (version !== request.current.version) return;
      // Previously edited covers stay visible while another cover is selected.
      setCovers((items) => (items.some((v) => v.tile.book.id === id) ? items : [...items, cover]));
      if (!edits.get()[id]) edits.set({ ...edits.get(), [id]: tile.book.crop ?? { ...DEFAULT_POSTER_CROP } });
      selected.set(cover);
      setActive(cover);
      if (focus) {
        const fit = fitPosterCamera(page.width, page.height, width, height);
        const scale = Math.max(fit.scale, Math.min((width * 0.52) / tile.width, (height * 0.62) / tile.height));
        const next = clampPosterCamera(
          {
            scale,
            x: width / 2 - (tile.x + tile.width / 2) * scale,
            y: height / 2 - (tile.y + tile.height / 2) * scale,
          },
          page.width,
          page.height,
          width,
          height,
        );
        camera.set(withTiming(next, { duration: 180 }));
      }
    } catch {
      if (version === request.current.version) setFailed(true);
    } finally {
      if (version === request.current.version) setLoading(false);
    }
  };
  const initialSelection = useRef(false);
  useEffect(() => {
    if (!initialId || !overlay || initialSelection.current) return;
    initialSelection.current = true;
    // Selecting is asynchronous, just like tapping a cover once the overlay is ready.
    void select(initialId, false);
  });
  const selectAt = (x: number, y: number) => {
    if (!overlay) return;
    const c = camera.get();
    const px = (x - c.x) / c.scale,
      py = (y - c.y) / c.scale;
    const tile = page.tiles.find((v) => px >= v.x && px < v.x + v.width && py >= v.y && py < v.y + v.height);
    if (tile?.book.coverUri) void select(tile.book.id, true);
  };
  const isCover = (x: number, y: number) => {
    'worklet';
    const cover = selected.get();
    if (!cover) return false;
    const c = camera.get();
    const px = (x - c.x) / c.scale,
      py = (y - c.y) / c.scale;
    const tile = cover.tile;
    return px >= tile.x && px < tile.x + tile.width && py >= tile.y && py < tile.y + tile.height;
  };
  const pan = Gesture.Pan()
    .enabled(!!overlay)
    .maxPointers(1)
    .minDistance(3)
    .onStart((e) => {
      if (owner.get() === 'pinch') return;
      owner.set('pan');
      target.set(isCover(e.x, e.y) ? 'cover' : 'page');
      previous.set({ x: e.translationX, y: e.translationY, scale: 1, pointers: 1 });
    })
    .onUpdate((e) => {
      if (owner.get() !== 'pan' || e.numberOfPointers !== 1) return;
      const dx = e.translationX - previous.get().x,
        dy = e.translationY - previous.get().y;
      const c = camera.get(),
        cover = selected.get();
      if (target.get() === 'cover' && cover) {
        const id = cover.tile.book.id;
        edits.set({
          ...edits.get(),
          [id]: panPosterCrop(
            edits.get()[id],
            dx / c.scale,
            dy / c.scale,
            cover.width,
            cover.height,
            cover.tile.width,
            cover.tile.height,
          ),
        });
      } else camera.set(clampPosterCamera({ ...c, x: c.x + dx, y: c.y + dy }, page.width, page.height, width, height));
      previous.set({ ...previous.get(), x: e.translationX, y: e.translationY });
    })
    .onFinalize(() => {
      if (owner.get() === 'pan') owner.set('idle');
    });
  const pinch = Gesture.Pinch()
    .enabled(!!overlay)
    .onStart((e) => {
      owner.set('pinch');
      target.set(isCover(e.focalX, e.focalY) ? 'cover' : 'page');
      previous.set({ x: e.focalX, y: e.focalY, scale: e.scale, pointers: e.numberOfPointers });
    })
    .onUpdate((e) => {
      if (owner.get() !== 'pinch') return;
      const p = previous.get(),
        c = camera.get(),
        cover = selected.get();
      if (p.pointers === e.numberOfPointers) {
        const ratio = e.scale / p.scale;
        if (target.get() === 'cover' && cover) {
          const tile = cover.tile,
            id = tile.book.id,
            crop = edits.get()[id];
          edits.set({
            ...edits.get(),
            [id]: zoomPosterCrop(
              crop,
              crop.zoom * ratio,
              (p.x - c.x) / c.scale - tile.x,
              (p.y - c.y) / c.scale - tile.y,
              cover.width,
              cover.height,
              tile.width,
              tile.height,
              (e.focalX - c.x) / c.scale - tile.x,
              (e.focalY - c.y) / c.scale - tile.y,
            ),
          });
        } else {
          const scale = clampPosterCamera(
            { ...c, scale: c.scale * ratio },
            page.width,
            page.height,
            width,
            height,
          ).scale;
          camera.set(
            clampPosterCamera(
              { scale, x: e.focalX - ((p.x - c.x) * scale) / c.scale, y: e.focalY - ((p.y - c.y) * scale) / c.scale },
              page.width,
              page.height,
              width,
              height,
            ),
          );
        }
      }
      previous.set({ x: e.focalX, y: e.focalY, scale: e.scale, pointers: e.numberOfPointers });
    })
    .onFinalize(() => {
      if (owner.get() === 'pinch') owner.set('idle');
    });
  const tap = Gesture.Tap()
    .maxDistance(8)
    // Gesture callbacks execute on touch events, outside React rendering.
    // eslint-disable-next-line react-hooks/refs
    .onEnd((e, success) => {
      if (success) scheduleOnRN(selectAt, e.x, e.y);
    });
  const sceneStyle = useAnimatedStyle(() => ({
    transformOrigin: 'top left',
    transform: [{ translateX: camera.get().x }, { translateY: camera.get().y }, { scale: camera.get().scale }],
  }));
  const borderStyle = useAnimatedStyle(() => {
    const tile = selected.get()?.tile;
    return {
      opacity: tile ? 1 : 0,
      left: tile?.x ?? 0,
      top: tile?.y ?? 0,
      width: tile?.width ?? 0,
      height: tile?.height ?? 0,
      borderWidth: 1.5 / camera.get().scale,
    };
  });
  return (
    <View className="flex-1">
      <View className="flex-row items-center justify-between px-3 py-2">
        <Button size="sm" variant="ghost" onPress={onCancel}>
          {t('action.cancel')}
        </Button>
        <Text className="text-base font-semibold text-foreground">{t('statistics.posterCropTitle')}</Text>
        <Button size="sm" variant="ghost" isDisabled={!overlay || loading} onPress={() => onApply({ ...edits.get() })}>
          {t('statistics.posterCropApply')}
        </Button>
      </View>
      <View className="flex-1" onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>
        <GestureDetector gesture={Gesture.Simultaneous(pan, pinch, tap)}>
          <View
            collapsable={false}
            className="overflow-hidden bg-default"
            style={{ width, height }}
            accessibilityLabel={t('statistics.posterCropCanvas')}>
            <Animated.View className="absolute" style={[{ width: page.width, height: page.height }, sceneStyle]}>
              <Image source={{ uri }} className="h-full w-full" resizeMode="stretch" resizeMethod="scale" />
              {overlay &&
                covers.map((cover) => (
                  <LiveCover key={cover.tile.book.id} cover={cover} page={page} overlay={overlay} edits={edits} />
                ))}
              <Animated.View pointerEvents="none" className="absolute border-navigation-active" style={borderStyle} />
            </Animated.View>
            {(!overlay || loading) && (
              <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
                <ActivityIndicator />
              </View>
            )}
          </View>
        </GestureDetector>
      </View>
      <View className="gap-2 px-4 py-3">
        <Text numberOfLines={1} className="text-center text-sm font-medium text-foreground">
          {active?.tile.book.title ?? t('statistics.posterCropSelect')}
        </Text>
        <Text className="text-center text-xs text-muted">
          {t(active ? 'statistics.posterCropGesture' : 'statistics.posterCropBrowse')}
        </Text>
        <View className="flex-row gap-3">
          <Button
            className="flex-1"
            variant="secondary"
            onPress={() => {
              selected.set(null);
              setActive(undefined);
              request.current.version++;
              setLoading(false);
              camera.set(withTiming(fitPosterCamera(page.width, page.height, width, height), { duration: 180 }));
            }}>
            {t('statistics.posterCropOverview')}
          </Button>
          <Button
            className="flex-1"
            variant="secondary"
            isDisabled={!active}
            onPress={() => {
              if (active) edits.set({ ...edits.get(), [active.tile.book.id]: { ...DEFAULT_POSTER_CROP } });
            }}>
            {t('statistics.posterCropReset')}
          </Button>
        </View>
        {failed && (
          <Button
            variant="ghost"
            onPress={() => {
              setFailed(false);
              setRevision((v) => v + 1);
            }}>
            {t('statistics.retry')}
          </Button>
        )}
      </View>
    </View>
  );
}

export function PosterCoverEditor(props: {
  page: PosterPage;
  labels: PosterLabels;
  uri: string;
  initialId?: string;
  crops: Record<string, PosterCrop>;
  onCancel: () => void;
  onApply: (crops: Record<string, PosterCrop>) => void;
}) {
  const insets = useSafeAreaInsets();
  const [viewport, setViewport] = useState<{ width: number; height: number }>();
  return (
    <Modal visible animationType="slide" onRequestClose={props.onCancel}>
      <StyledGestureRoot
        unstable_forceActive
        className="flex-1 bg-background"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View
          className="flex-1"
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setViewport((old) => (old?.width === width && old.height === height ? old : { width, height }));
          }}>
          {viewport && <PosterScene {...props} width={viewport.width} height={Math.max(120, viewport.height - 204)} />}
        </View>
      </StyledGestureRoot>
    </Modal>
  );
}
