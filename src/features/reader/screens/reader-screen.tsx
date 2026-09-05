import { useLocalSearchParams, useRouter } from 'expo-router';
import { NavigationBar } from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { Spinner } from 'heroui-native/spinner';
import { useToast } from 'heroui-native/toast';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useCSSVariable, useResolveClassNames, useUniwind } from 'uniwind';
import {
  SafeAreaListener,
  useSafeAreaInsets,
  type EdgeInsets,
  type SafeAreaListenerProps,
} from 'react-native-safe-area-context';

import { IconTabBar } from '@/components/ui/icon-tab-bar';
import { useTranslation } from '@/i18n';
import {
  createReaderWordSelectionAtPoint,
  createReaderTextSelectionFromSourceRange,
  findReaderHitIndex,
  updateReaderTextSelectionBoundaryAtPoint,
  updateReaderTextSelectionAtPoint,
  type ReaderFootnote,
  type ReaderTextSelection,
  type ReaderViewport,
} from '@/reader';
import {
  ReaderSurface,
  useReaderPageTurn,
  type ReaderSurfaceTransform,
} from '@/reader/native';
import { useReaderStore } from '@/stores';
import { ProgressDrawer } from '../components/bottom-tabs/progress-drawer';
import { TocDrawer } from '../components/bottom-tabs/toc-drawer';
import { TypographyDrawer } from '../components/bottom-tabs/typography-drawer';
import { ReaderControls } from '../components/reader-controls';
import { FootnoteDrawer } from '../components/footnote-drawer';
import {
  configureReaderSelectionGesture,
  ReaderSelectionControls,
} from '../components/reader-selection-controls';
import { useReaderHighlights } from '../hooks/use-reader-highlights';
import { useReaderSession } from '../hooks/use-reader-session';
import { containsHighlightRange } from '../domain/highlight-ranges';
import type { ReaderHighlightColor } from '../domain/reader-highlight';
import {
  createReaderHighlightOverlayResolver,
  createReaderHighlightRegions,
  resolveReaderSelectionSourceRange,
} from '../services/highlight-overlay-service';

// The canvas covers the window; these values only keep page content away from its edges.
const ReaderSurfaceTopSpacing = 4;
const ReaderSurfaceBottomSpacing = 4;
const EmptyReaderHitEntries = [] as const;

interface OwnedReaderTextSelection extends ReaderTextSelection {
  readonly revisionId: number;
  readonly spreadIndex: number;
  readonly renderId?: number;
}

export default function ReaderScreen() {
  const { t } = useTranslation();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { toast } = useToast();
  const [reservedInsets, setReservedInsets] = useState(insets);
  const { theme } = useUniwind();
  const selectionFillColor = useCSSVariable('--color-reader-selection-fill') as string;
  const highlightFillColor = useCSSVariable('--color-reader-highlight-fill') as string;
  const highlightPink = useCSSVariable('--color-reader-highlight-pink') as string;
  const highlightPurple = useCSSVariable('--color-reader-highlight-purple') as string;
  const highlightBlue = useCSSVariable('--color-reader-highlight-blue') as string;
  const highlightGreen = useCSSVariable('--color-reader-highlight-green') as string;
  const highlightColors = useMemo(() => ({
    yellow: highlightFillColor, pink: highlightPink, purple: highlightPurple,
    blue: highlightBlue, green: highlightGreen,
  }), [highlightFillColor, highlightPink, highlightPurple, highlightBlue, highlightGreen]);
  const absoluteFillStyle = useResolveClassNames('absolute inset-0');
  const [viewport, setViewport] = useState<ReaderViewport>();
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isProgressOpen, setIsProgressOpen] = useState(false);
  const [isTypographyOpen, setIsTypographyOpen] = useState(false);
  const [footnote, setFootnote] = useState<ReaderFootnote>();
  const [isFootnoteOpen, setIsFootnoteOpen] = useState(false);
  const [selectionState, setSelection] = useState<OwnedReaderTextSelection>();
  const [isHighlighting, setIsHighlighting] = useState(false);
  const selectionRef = useRef<ReaderTextSelection | undefined>(undefined);
  const isHighlightingRef = useRef(false);
  const [surfaceTransform, setSurfaceTransform] = useState<ReaderSurfaceTransform>();
  const footnoteRequestRef = useRef(0);
  const errorToastKey = useRef<string | undefined>(undefined);
  const readerTheme = theme === 'dark' ? 'dark' : 'light';
  const animationStyle = useReaderStore((state) => state.animationStyle);
  const spreadMode = useReaderStore((state) => state.typography.spreadMode);
  const contentInsets = useMemo(() => ({
    top: reservedInsets.top + ReaderSurfaceTopSpacing,
    right: reservedInsets.right,
    bottom: reservedInsets.bottom + ReaderSurfaceBottomSpacing,
    left: reservedInsets.left,
  }), [reservedInsets]);
  const session = useReaderSession({
    bookId: bookId ?? '',
    viewport,
    contentInsets,
    theme: readerTheme,
  });
  const { highlights, addHighlight, removeHighlights, isLoaded: highlightsLoaded, error: highlightsError } = useReaderHighlights(bookId ?? '');
  const resolvePageHighlights = useMemo(() => createReaderHighlightOverlayResolver(highlights, highlightColors),
    [highlights, highlightColors]);
  const {
    gesture: pageTurnGesture,
    interactiveTurn,
    automaticTurns,
    automaticNavigationActive,
    isSettling,
    completeAutomaticTurn,
    surfaceBinding: pageTurnSurfaceBinding,
    next,
    previous,
  } = useReaderPageTurn({
    runtime: session.runtime,
    snapshot: session.snapshot,
    viewport,
    animationStyle,
    spreadMode,
    surfaceTop: 0,
  });
  const isReady = session.snapshot.phase === 'ready' && (highlightsLoaded || Boolean(highlightsError));
  const currentHitEntries = isReady
    ? session.runtime.getCurrentHitMap()?.entries ?? EmptyReaderHitEntries
    : EmptyReaderHitEntries;
  const selection = selectionState?.revisionId === session.snapshot.revisionId
    && selectionState.spreadIndex === session.snapshot.spreadIndex
    && selectionState.renderId === session.snapshot.renderId
    ? selectionState
    : undefined;
  const chapterHref = session.snapshot.position?.locator?.manifestHref ?? '';
  const highlightRegions = useMemo(() => createReaderHighlightRegions(currentHitEntries, highlights, chapterHref),
    [chapterHref, currentHitEntries, highlights]);
  const activeHighlight = selection?.sourceRange
    ? highlights.find((highlight) => highlight.href === chapterHref
      && containsHighlightRange(highlight.sourceRange, selection.sourceRange!))
    : undefined;
  const expandHighlightSelection = useCallback((value: ReaderTextSelection): ReaderTextSelection => {
    const range = value.sourceRange;
    if (!range) return value;
    const highlight = highlights.find((item) => item.href === chapterHref && containsHighlightRange(item.sourceRange, range));
    if (!highlight) return value;
    const expanded = createReaderTextSelectionFromSourceRange(currentHitEntries, highlight.sourceRange);
    return expanded ? { ...expanded, text: highlight.text, sourceRange: highlight.sourceRange } : value;
  }, [chapterHref, currentHitEntries, highlights]);
  const chapterTitle = session.snapshot.chapterTitle
    ?? session.metadata?.title
    ?? session.book?.title
    ?? t('reader.loadingChapter');
  const bookTitle = session.book?.title
    ?? session.metadata?.title
    ?? t('reader.loadingBook');
  const totalSpreads = session.snapshot.totalSpreads;
  const currentSpread = session.snapshot.bookSpreadIndex ?? session.snapshot.spreadIndex;
  const progressText = totalSpreads === undefined
    ? t('reader.calculatingPages')
    : `${currentSpread + 1} / ${totalSpreads}`;
  const progressPercentage = totalSpreads === undefined
    ? undefined
    : Math.round((currentSpread / Math.max(totalSpreads - 1, 1)) * 100);
  const initialPaperColor = readerTheme === 'dark' ? '#000000' : '#FFFFFF';
  const canvasBackground = isReady
    ? session.runtime.getBackgroundColor()
    : initialPaperColor;
  const readerChromeVisible = controlsVisible || Boolean(session.errorMessage);
  const handleSafeAreaChange = useCallback<SafeAreaListenerProps['onChange']>(
    ({ insets: nextInsets }) => {
      setReservedInsets((current) => preserveLargestInsets(current, nextInsets));
    },
    [],
  );

  useEffect(() => {
    if (highlightsError) toast.show({ variant: 'danger', label: t('reader.highlightLoadFailed') });
  }, [highlightsError, t, toast]);

  useEffect(() => {
    if (!session.errorMessage) {
      errorToastKey.current = undefined;
      return;
    }

    const nextErrorToastKey = `${bookId ?? ''}:${session.errorMessage}`;
    if (errorToastKey.current === nextErrorToastKey) {
      return;
    }

    errorToastKey.current = nextErrorToastKey;
    toast.show({
      variant: 'danger',
      label: t('reader.loadingFailed'),
      description: session.errorMessage,
    });
  }, [bookId, session.errorMessage, t, toast]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setViewport((current) => {
      const nextViewport = {
        width: Math.round(width),
        height: Math.round(height),
        pixelRatio: PixelRatio.get(),
      };
      return current?.width === nextViewport.width && current.height === nextViewport.height
        ? current
        : nextViewport;
    });
  }, []);

  const handleSurfaceTransform = useCallback((transform: ReaderSurfaceTransform) => {
    setSurfaceTransform(transform);
  }, []);

  const clearSelection = useCallback(() => {
    selectionRef.current = undefined;
    setSelection(undefined);
  }, []);

  const displayPoint = useCallback((x: number, y: number) => {
    return surfaceTransform?.toDisplayPoint(x, y) ?? { x, y };
  }, [surfaceTransform]);

  const beginSelection = useCallback((x: number, y: number) => {
    const hitMap = session.runtime.getCurrentHitMap();
    if (!hitMap) return;
    const point = displayPoint(x, y);
    const wordSelection = createReaderWordSelectionAtPoint(hitMap.entries, point.x, point.y);
    if (!wordSelection) return;
    const nextSelection = expandHighlightSelection(wordSelection);
    selectionRef.current = nextSelection;
    setSelection({
      ...nextSelection,
      revisionId: session.snapshot.revisionId,
      spreadIndex: session.snapshot.spreadIndex,
      renderId: session.snapshot.renderId,
    });
    setControlsVisible(false);
  }, [displayPoint, expandHighlightSelection, session.runtime, session.snapshot.renderId, session.snapshot.revisionId, session.snapshot.spreadIndex]);

  const updateSelection = useCallback((x: number, y: number) => {
    const currentSelection = selectionRef.current;
    const hitMap = session.runtime.getCurrentHitMap();
    if (!currentSelection || !hitMap) return;
    const point = displayPoint(x, y);
    const nextSelection = updateReaderTextSelectionAtPoint(
      hitMap.entries,
      currentSelection,
      point.x,
      point.y,
    );
    if (!nextSelection) return;
    selectionRef.current = nextSelection;
    setSelection({
      ...nextSelection,
      revisionId: session.snapshot.revisionId,
      spreadIndex: session.snapshot.spreadIndex,
      renderId: session.snapshot.renderId,
    });
  }, [displayPoint, session.runtime, session.snapshot.renderId, session.snapshot.revisionId, session.snapshot.spreadIndex]);

  const updateSelectionBoundary = useCallback((
    boundary: 'start' | 'end',
    x: number,
    y: number,
  ) => {
    const currentSelection = selectionRef.current;
    const hitMap = session.runtime.getCurrentHitMap();
    if (!currentSelection || !hitMap) return;
    const point = displayPoint(x, y);
    const nextSelection = updateReaderTextSelectionBoundaryAtPoint(
      hitMap.entries,
      currentSelection,
      boundary,
      point.x,
      point.y,
    );
    if (!nextSelection) return;
    selectionRef.current = nextSelection;
    setSelection({
      ...nextSelection,
      revisionId: session.snapshot.revisionId,
      spreadIndex: session.snapshot.spreadIndex,
      renderId: session.snapshot.renderId,
    });
  }, [displayPoint, session.runtime, session.snapshot.renderId, session.snapshot.revisionId, session.snapshot.spreadIndex]);

  const refineSelectionGeometry = useCallback(async () => {
    const currentSelection = selectionRef.current;
    if (!currentSelection) return;
    const requestedSelection = expandHighlightSelection(currentSelection);
    const revisionId = session.snapshot.revisionId;
    const spreadIndex = session.snapshot.spreadIndex;
    const renderId = session.snapshot.renderId;
    selectionRef.current = requestedSelection;
    setSelection({ ...requestedSelection, revisionId, spreadIndex, renderId });
    if (requestedSelection.geometryRequests.length === 0) return;
    const groups = await Promise.all(
      requestedSelection.geometryRequests.map((request) =>
        session.runtime.resolveTextRangeGeometry(request).catch(() => [])),
    );
    if (
      selectionRef.current !== requestedSelection
      || session.runtime.getSnapshot().revisionId !== revisionId
      || session.runtime.getSnapshot().spreadIndex !== spreadIndex
      || session.runtime.getSnapshot().renderId !== renderId
    ) return;
    const bounds = groups.flat().map((rect) => rect.bounds);
    if (bounds.length === 0) return;
    const refinedSelection = { ...requestedSelection, bounds };
    selectionRef.current = refinedSelection;
    setSelection({ ...refinedSelection, revisionId, spreadIndex, renderId });
  }, [expandHighlightSelection, session.runtime, session.snapshot.renderId, session.snapshot.revisionId, session.snapshot.spreadIndex]);

  /* eslint-disable react-hooks/refs */
  const selectionGesture = useMemo(() => configureReaderSelectionGesture(Gesture.Pan())
    .enabled(isReady && !isSettling)
    .averageTouches(true)
    .cancelsTouchesInView(true)
    .runOnJS(true)
    .onStart((event) => beginSelection(event.x, event.y))
    .onUpdate((event) => updateSelection(event.x, event.y))
    .onEnd(() => {
      void refineSelectionGeometry();
    }),
  [beginSelection, isReady, isSettling, refineSelectionGeometry, updateSelection]);
  /* eslint-enable react-hooks/refs */
  const readingGesture = useMemo(
    () => Gesture.Exclusive(selectionGesture, pageTurnGesture),
    [pageTurnGesture, selectionGesture],
  );

  const openFootnote = useCallback(async (key: string, pending = false) => {
    const request = footnoteRequestRef.current + 1;
    footnoteRequestRef.current = request;
    setFootnote(undefined);
    setIsFootnoteOpen(true);
    let lastError: unknown;
    try {
      const attempts = pending ? 8 : 1;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          const nextFootnote = await session.runtime.readFootnote(key);
          if (nextFootnote) {
            if (footnoteRequestRef.current === request) setFootnote(nextFootnote);
            return;
          }
        } catch (error) {
          lastError = error;
        }
        if (attempt + 1 < attempts) await delay(160);
      }
      throw lastError ?? new Error(t('reader.footnoteUnavailable'));
    } catch (error) {
      if (footnoteRequestRef.current !== request) return;
      setIsFootnoteOpen(false);
      toast.show({
        variant: 'danger',
        label: t('reader.footnoteUnavailable'),
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }, [session.runtime, t, toast]);

  const openHyperlink = useCallback(async (href: string) => {
    try {
      if (isExternalHref(href)) {
        const externalUrl = href.startsWith('//') ? `https:${href}` : href;
        const scheme = externalUrl.slice(0, externalUrl.indexOf(':')).toLowerCase();
        if (!AllowedExternalLinkSchemes.has(scheme) || !(await Linking.canOpenURL(externalUrl))) {
          throw new Error(t('reader.linkSchemeUnsupported'));
        }
        await Linking.openURL(externalUrl);
      } else {
        await session.runtime.goToToc(href);
      }
    } catch (error) {
      toast.show({
        variant: 'danger',
        label: t('reader.linkOpenFailed'),
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }, [session.runtime, t, toast]);

  const handleReadingPress = useCallback(
    (x: number, y: number) => {
      if (!viewport || !isReady || isSettling) return;
      if (selection) {
        clearSelection();
        return;
      }
      const hitMap = session.runtime.getCurrentHitMap();
      const point = displayPoint(x, y);
      const region = highlightRegions.find(({ selection: highlightedSelection }) =>
        highlightedSelection.bounds.some((bounds) => point.x >= bounds.x && point.x <= bounds.x + bounds.width
          && point.y >= bounds.y && point.y <= bounds.y + bounds.height));
      if (region) {
        const nextSelection = { ...region.selection, sourceRange: region.highlight.sourceRange, text: region.highlight.text };
        selectionRef.current = nextSelection;
        setSelection({
          ...nextSelection,
          revisionId: session.snapshot.revisionId,
          spreadIndex: session.snapshot.spreadIndex,
          renderId: session.snapshot.renderId,
        });
        setControlsVisible(false);
        return;
      }
      const hitIndex = hitMap
        ? findReaderHitIndex(hitMap.entries, point.x, point.y)
        : undefined;
      const hit = hitIndex === undefined ? undefined : hitMap?.entries[hitIndex];
      if (hit?.footnoteKey) {
        void openFootnote(hit.footnoteKey, hit.footnotePending);
        return;
      }
      if (hit?.href) {
        void openHyperlink(hit.href);
        return;
      }
      if (x < viewport.width * 0.3) {
        void previous();
      } else if (x > viewport.width * 0.7) {
        void next();
      } else {
        setControlsVisible((value) => !value);
      }
    },
    [clearSelection, displayPoint, highlightRegions, isReady, isSettling, next, openFootnote, openHyperlink, previous, selection, session.runtime, session.snapshot, viewport],
  );

  const copySelection = useCallback(async () => {
    if (!selection?.text) return;
    await Clipboard.setStringAsync(selection.text);
    toast.show({ variant: 'success', label: t('reader.selectionCopied') });
    clearSelection();
  }, [clearSelection, selection, t, toast]);

  const highlightSelection = useCallback(async (color?: ReaderHighlightColor) => {
    const href = session.snapshot.position?.locator?.manifestHref;
    if (isHighlightingRef.current) return;
    if (!selection || !href || !bookId) {
      toast.show({ variant: 'danger', label: t('reader.highlightUnavailable') });
      return;
    }
    isHighlightingRef.current = true;
    setIsHighlighting(true);
    try {
      const sourceRange = await resolveReaderSelectionSourceRange(
        session.runtime,
        selection,
        href,
      );
      if (!sourceRange) {
        toast.show({ variant: 'danger', label: t('reader.highlightUnavailable') });
        return;
      }
      const selected = selectionRef.current;
      const operation = addHighlight({
        href,
        sourceRange,
        text: selection.text,
        color: color ?? activeHighlight?.color ?? 'yellow',
      });
      const saved = await operation;
      toast.show({ variant: 'success', label: t('reader.highlightSaved') });
      if (!color && selectionRef.current === selected) clearSelection();
      const latest = session.runtime.getSnapshot();
      if (color && selectionRef.current === selected
        && latest.revisionId === selection.revisionId
        && latest.spreadIndex === selection.spreadIndex
        && latest.renderId === selection.renderId) {
        const expanded = createReaderTextSelectionFromSourceRange(currentHitEntries, saved.sourceRange);
        if (expanded) {
          const updated = { ...selection, ...expanded, sourceRange: saved.sourceRange, text: saved.text };
          selectionRef.current = updated;
          setSelection(updated);
        }
      }
    } catch (error) {
      toast.show({
        variant: 'danger',
        label: t('reader.highlightSaveFailed'),
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      isHighlightingRef.current = false;
      setIsHighlighting(false);
    }
  }, [activeHighlight, addHighlight, bookId, clearSelection, currentHitEntries, selection, session.runtime, session.snapshot.position?.locator?.manifestHref, t, toast]);

  const deleteHighlight = useCallback(async () => {
    if (!activeHighlight || isHighlightingRef.current) return;
    isHighlightingRef.current = true;
    setIsHighlighting(true);
    const selected = selectionRef.current;
    try {
      await removeHighlights([activeHighlight.id]);
      if (selectionRef.current === selected) clearSelection();
      toast.show({ variant: 'success', label: t('reader.highlightRemoved') });
    } catch (error) {
      toast.show({ variant: 'danger', label: t('reader.highlightSaveFailed'), description: error instanceof Error ? error.message : undefined });
    } finally {
      isHighlightingRef.current = false;
      setIsHighlighting(false);
    }
  }, [activeHighlight, clearSelection, removeHighlights, t, toast]);

  const selectionOverlays = useMemo(() =>
    activeHighlight ? [] : (selection?.bounds.map((bounds) => ({
        revisionId: session.snapshot.revisionId,
        bounds,
        color: selectionFillColor,
        radius: 2,
      })) ?? []),
  [activeHighlight, selection?.bounds, selectionFillColor, session.snapshot.revisionId]);
  const selectionViewportRects = useMemo(() => {
    if (!selection || !surfaceTransform) return [];
    return selection.bounds.map((bounds) => {
      const origin = surfaceTransform.toViewportPoint(bounds.x, bounds.y);
      return {
        x: origin.x,
        y: origin.y,
        width: bounds.width * surfaceTransform.scale,
        height: bounds.height * surfaceTransform.scale,
      };
    });
  }, [selection, surfaceTransform]);
  const interactiveHits = isReady && !selection
    ? currentHitEntries.filter((entry) => entry.footnoteKey || entry.href)
    : [];

  const handleFootnoteOpenChange = useCallback((value: boolean) => {
    setIsFootnoteOpen(value);
    if (!value) footnoteRequestRef.current += 1;
  }, []);

  const handleTabSelect = useCallback((key: string) => {
    if (key === 'toc') {
      setIsProgressOpen(false);
      setIsTypographyOpen(false);
      setIsTocOpen(true);
      return;
    }
    if (key === 'progress') {
      setIsTocOpen(false);
      setIsTypographyOpen(false);
      setIsProgressOpen(true);
      return;
    }
    if (key === 'typography') {
      setIsTocOpen(false);
      setIsProgressOpen(false);
      setIsTypographyOpen(true);
    }
  }, []);

  const statusText = useMemo(() => {
    switch (session.snapshot.phase) {
      case 'opening':
        return t('reader.loadingEpub');
      case 'paginating':
        return t('reader.paginating');
      case 'reflowing':
        return t('reader.reflowing');
      default:
        return t('reader.preparing');
    }
  }, [session.snapshot.phase, t]);

  return (
    <View className="flex-1" style={{ backgroundColor: canvasBackground }}>
      <SafeAreaListener
        onChange={handleSafeAreaChange}
        pointerEvents="none"
        style={absoluteFillStyle}
      />
      <StatusBar
        animated
        hidden={!readerChromeVisible}
        style={readerTheme === 'dark' ? 'light' : 'dark'}
      />
      <NavigationBar
        hidden={!readerChromeVisible}
        style={readerTheme === 'dark' ? 'dark' : 'light'}
      />

      <View
        onLayout={handleLayout}
        className="absolute inset-0">
        <ReaderSurface
          runtime={session.runtime}
          snapshot={session.snapshot}
          initialBackgroundColor={initialPaperColor}
          animationStyle={animationStyle}
          spreadMode={spreadMode}
          interactiveTurn={interactiveTurn}
          automaticTurns={automaticTurns}
          automaticNavigationActive={automaticNavigationActive}
          onAutomaticTurnComplete={completeAutomaticTurn}
          pageTurnSurfaceBinding={pageTurnSurfaceBinding}
          chapterTitle={chapterTitle}
          progressLabel={`${progressText}${progressPercentage === undefined ? '' : ` · ${progressPercentage}%`}`}
          overlayColor={readerTheme === 'dark' ? '#A3A3A3' : '#5C5C5C'}
          overlayInsets={contentInsets}
          overlays={selectionOverlays}
          resolvePageOverlays={resolvePageHighlights}
          onTransformChange={handleSurfaceTransform}
          style={absoluteFillStyle}
        />
        <GestureDetector gesture={readingGesture}>
          <View collapsable={false} className="absolute inset-0">
            <Pressable
              accessibilityLabel={t('reader.readerPage')}
              accessibilityRole="adjustable"
              accessibilityValue={{
                min: 1,
                max: totalSpreads ?? Math.max(1, currentSpread + 1),
                now: currentSpread + 1,
                text: progressText,
              }}
              onPress={(event) => handleReadingPress(
                event.nativeEvent.locationX,
                event.nativeEvent.locationY,
              )}
              className="absolute inset-0"
            />
            {surfaceTransform && interactiveHits.map((hit, index) => {
              const origin = surfaceTransform.toViewportPoint(hit.bounds.x, hit.bounds.y);
              return (
                <Pressable
                  key={`${hit.pageIndex}:${index}:${hit.footnoteKey ?? hit.href}`}
                  accessibilityHint={hit.footnoteKey
                    ? t('reader.openFootnote')
                    : t('reader.openLink')}
                  accessibilityLabel={hit.text || hit.imageAlt || hit.href}
                  accessibilityRole={hit.footnoteKey ? 'button' : 'link'}
                  className="absolute"
                  hitSlop={6}
                  onPress={() => {
                    if (hit.footnoteKey) {
                      void openFootnote(hit.footnoteKey, hit.footnotePending);
                    } else if (hit.href) {
                      void openHyperlink(hit.href);
                    }
                  }}
                  style={{
                    left: origin.x,
                    top: origin.y,
                    width: hit.bounds.width * surfaceTransform.scale,
                    height: hit.bounds.height * surfaceTransform.scale,
                  }}
                />
              );
            })}
          </View>
        </GestureDetector>
      </View>

      {selection && viewport && (
        <ReaderSelectionControls
          copyLabel={t('reader.copySelection')}
          endHandleLabel={t('reader.selectionEndHandle')}
          highlightLabel={t(activeHighlight ? 'reader.removeHighlight' : 'reader.highlightSelection')}
          isExistingHighlight={Boolean(activeHighlight)}
          selectedColor={activeHighlight?.color ?? 'yellow'}
          colorLabels={{ yellow: t('reader.highlightYellow'), pink: t('reader.highlightPink'), purple: t('reader.highlightPurple'), blue: t('reader.highlightBlue'), green: t('reader.highlightGreen') }}
          onColorChange={(color) => void highlightSelection(color)}
          isHighlightDisabled={isHighlighting || !highlightsLoaded}
          onBoundaryMove={updateSelectionBoundary}
          onBoundaryMoveEnd={() => void refineSelectionGeometry()}
          onCopy={() => void copySelection()}
          onHighlight={() => void (activeHighlight ? deleteHighlight() : highlightSelection())}
          rects={selectionViewportRects}
          safeAreaInsets={reservedInsets}
          selectionLabel={t('reader.selectionToolbar')}
          startHandleLabel={t('reader.selectionStartHandle')}
          viewportHeight={viewport.height}
          viewportWidth={viewport.width}
        />
      )}

      {readerChromeVisible && (
        <ReaderControls
          onBack={() => router.back()}
          safeAreaInsets={reservedInsets}
          bookTitle={bookTitle}
        />
      )}

      {(controlsVisible || isTocOpen || isProgressOpen || isTypographyOpen) && (
        <IconTabBar
          activeKey={isTocOpen ? 'toc' : isProgressOpen ? 'progress' : isTypographyOpen ? 'typography' : undefined}
          items={[
            { key: 'toc', accessibilityLabel: t('reader.openToc'), name: { ios: 'list.bullet', android: 'format_list_bulleted', web: 'list' } },
            { key: 'progress', accessibilityLabel: t('reader.openProgress'), name: { ios: 'chart.bar', android: 'timeline', web: 'timeline' } },
            { key: 'typography', accessibilityLabel: t('reader.openTypography'), name: { ios: 'textformat.size', android: 'format_size', web: 'format_size' } },
          ]}
          onSelect={handleTabSelect}
          safeAreaInsets={reservedInsets}
        />
      )}

      {!isReady && !session.errorMessage && (
        <View className="absolute inset-0 items-center justify-center gap-4 bg-background">
          <Spinner color="default" size="lg" />
          <Text className="text-sm text-muted">{statusText}</Text>
        </View>
      )}

      {session.errorMessage && (
        <View className="absolute inset-0 items-center justify-center gap-3 bg-background px-8">
          <Text className="text-center text-xl font-semibold text-foreground">
            {t('reader.loadingFailed')}
          </Text>
          <Text className="text-center text-sm leading-6 text-muted">
            {session.errorMessage}
          </Text>
        </View>
      )}

      <TocDrawer
        isOpen={isTocOpen}
        onOpenChange={setIsTocOpen}
        runtime={session.runtime}
        snapshot={session.snapshot}
        toc={session.toc}
      />
      <ProgressDrawer
        isOpen={isProgressOpen}
        onOpenChange={setIsProgressOpen}
        runtime={session.runtime}
        snapshot={session.snapshot}
      />
      <TypographyDrawer
        isOpen={isTypographyOpen}
        onOpenChange={setIsTypographyOpen}
      />
      <FootnoteDrawer
        footnote={footnote}
        isOpen={isFootnoteOpen}
        onOpenChange={handleFootnoteOpenChange}
      />
    </View>
  );
}

function isExternalHref(href: string): boolean {
  if (href.startsWith('//')) return true;
  const pathEnd = Math.min(
    ...[href.indexOf('?'), href.indexOf('#')].filter((index) => index >= 0),
    href.length,
  );
  const colon = href.slice(0, pathEnd).indexOf(':');
  return colon > 0 && /^[A-Za-z][A-Za-z0-9+.-]*$/.test(href.slice(0, colon));
}

const AllowedExternalLinkSchemes = new Set(['http', 'https', 'mailto', 'tel', 'sms']);

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function preserveLargestInsets(current: EdgeInsets, next: EdgeInsets): EdgeInsets {
  const preserved = {
    top: Math.max(current.top, next.top),
    right: Math.max(current.right, next.right),
    bottom: Math.max(current.bottom, next.bottom),
    left: Math.max(current.left, next.left),
  };
  return preserved.top === current.top
    && preserved.right === current.right
    && preserved.bottom === current.bottom
    && preserved.left === current.left
    ? current
    : preserved;
}
