import { useLocalSearchParams, useRouter } from 'expo-router';
import { preparePosterTypeface } from '../infrastructure/poster-renderer';
import { Image as CoverImage } from 'expo-image';
import { withUniwind } from 'uniwind';
import { SymbolView } from 'expo-symbols';
import { Button } from 'heroui-native/button';
import { ControlField } from 'heroui-native/control-field';
import { useThemeColor } from 'heroui-native/hooks';
import { Input } from 'heroui-native/input';
import { Label } from 'heroui-native/label';
import { TextField } from 'heroui-native/text-field';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { Switch } from 'heroui-native/switch';
import { useToast } from 'heroui-native/toast';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '@/i18n';
import { ImageViewer } from '@/components/ui/image-viewer';
import { readingDateKey } from '@/features/reader';
import { DateRangeSheet } from '../components/date-range-sheet';
import { PosterCanvas, type PosterCanvasHandle } from '../components/poster-canvas';
import { PosterCoverEditor } from '../components/poster-cover-editor';
import { PosterAction, PosterOption, PosterOptionRow, PosterOptionSection } from '../components/poster-controls';
import type { PosterCrop } from '../domain/poster-crop';
import {
  buildPoster,
  posterPreset,
  posterInitialRange,
  type PosterBook,
  type PosterLabels,
  type PosterOutput,
} from '../domain/poster';
import { exportPosterPages } from '../domain/poster-export';
import { durationParts, selectPeriod, type DateRange } from '../domain/statistics';
import { loadStatistics } from '../repositories/statistics-repository';
import {
  PosterPermissionError,
  preparePosterBooks,
  removePosterImage,
  requestPosterPhotoPermission,
  savePosterImage,
  sharePosterImage,
  writePosterImage,
} from '../infrastructure/poster-image';

const StyledCoverImage = withUniwind(CoverImage);
const RANGE_PRESETS = ['year', 'lastMonth', 'quarter', 'lastYear'] as const;
const RANGE_PRESET_LABELS = {
  year: 'statistics.posterYear',
  lastMonth: 'statistics.posterLastMonth',
  quarter: 'statistics.posterQuarter',
  lastYear: 'statistics.posterLastYear',
} as const;
const OUTPUT_LABELS = {
  single: 'statistics.posterSingle',
  long: 'statistics.posterLong',
  pages: 'statistics.posterPages',
} as const;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export function PosterScreen() {
  const router = useRouter(),
    params = useLocalSearchParams<{ start?: string; end?: string }>(),
    { t } = useTranslation(),
    { toast } = useToast();
  const insets = useSafeAreaInsets(),
    { width, height } = useWindowDimensions();
  const [preview, setPreview] = useState<{
    uri: string;
    origin: { x: number; y: number; width: number; height: number };
  }>();
  const [today] = useState(() => readingDateKey(Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'));
  const [original] = useState<DateRange>(() => posterInitialRange(params.start, params.end, today));
  const [range, setRange] = useState(original),
    [rangeOpen, setRangeOpen] = useState(false),
    [data, setData] = useState<Awaited<ReturnType<typeof loadStatistics>>>(),
    [loadError, setLoadError] = useState(false),
    [revision, setRevision] = useState(0);
  const [title, setTitle] = useState(''),
    [quote, setQuote] = useState(''),
    [showBookDetails, setShowBookDetails] = useState(true),
    [seed, setSeed] = useState(1),
    [output, setOutput] = useState<PosterOutput>('single'),
    [page, setPage] = useState(0);
  const [readyPreview, setReadyPreview] = useState('');
  const [crops, setCrops] = useState<Record<string, PosterCrop>>({});
  const [cropEditor, setCropEditor] = useState<{ uri: string; labels: PosterLabels; initialId?: string }>();
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set()),
    [selection, setSelection] = useState<Set<string>>(() => new Set()),
    [choosing, setChoosing] = useState(false);
  const [preparation, setPreparation] = useState<{ source: readonly PosterBook[]; books?: PosterBook[] }>(),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(''),
    [saved, setSaved] = useState<Set<number>>(() => new Set()),
    [denied, setDenied] = useState(false);
  const iconColor = useThemeColor('foreground');
  // The drawer shows the export actions, or the poster settings in their place.
  const [panel, setPanel] = useState<'actions' | 'settings'>('actions');
  const editor = useRef<ScrollView>(null);
  const focusEditor = useCallback(() => {
    setTimeout(() => editor.current?.scrollToEnd({ animated: true }), 180);
  }, []);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', focusEditor);
    return () => show.remove();
  }, [focusEditor]);
  const canvas = useRef<PosterCanvasHandle>(null),
    abort = useRef(false),
    mounted = useRef(true),
    saving = useRef(false);
  const notifyLoadError = useEffectEvent(() =>
    toast.show({ variant: 'danger', label: t('statistics.posterLoadFailed') }),
  );
  const [fontReady, setFontReady] = useState(false);
  const [fontError, setFontError] = useState(false);
  useEffect(() => {
    let live = true;
    void preparePosterTypeface()
      .then(() => {
        if (live) {
          setFontReady(true);
          setFontError(false);
        }
      })
      .catch(() => {
        if (live) {
          setFontError(true);
          notifyLoadError();
        }
      });
    return () => {
      live = false;
    };
  }, [revision]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort.current = true;
    };
  }, []);
  const notifyPrepareError = useEffectEvent(() =>
    toast.show({ variant: 'danger', label: t('statistics.posterFailed') }),
  );
  useEffect(() => {
    let live = true;
    void loadStatistics()
      .then((v) => {
        if (live) setData(v);
      })
      .catch(() => {
        if (live) {
          setLoadError(true);
          notifyLoadError();
        }
      });
    return () => {
      live = false;
    };
  }, [revision]);
  const period = useMemo(() => (data ? selectPeriod(data, range) : undefined), [data, range]);
  const selected = useMemo(() => period?.books.filter((b) => !excluded.has(b.id)), [period, excluded]);
  useEffect(() => {
    const signal = { aborted: false };
    if (!selected)
      return () => {
        signal.aborted = true;
      };
    void preparePosterBooks(selected, signal)
      .then((v) => {
        if (!signal.aborted) {
          setPreparation({ source: selected, books: v });
        }
      })
      .catch(() => {
        if (!signal.aborted) {
          setPreparation({ source: selected });
          notifyPrepareError();
        }
      });
    return () => {
      signal.aborted = true;
    };
  }, [selected]);
  const prepared = preparation?.source === selected ? preparation?.books : undefined;
  const preparing = !selected || preparation?.source !== selected;
  const prepareFailed = !!selected && preparation?.source === selected && !prepared;
  const hasQuote = !!quote.trim();
  const posterBooks = useMemo(() => prepared?.map((book) => ({ ...book, crop: crops[book.id] })), [prepared, crops]);
  const document = useMemo(
    () => (posterBooks ? buildPoster(posterBooks, seed, output, hasQuote) : undefined),
    [posterBooks, seed, output, hasQuote],
  );
  const actualPage = Math.min(page, (document?.pages.length ?? 1) - 1);
  const job = useMemo(
    () => JSON.stringify([range, title, quote, showBookDetails, seed, output, posterBooks]),
    [range, title, quote, showBookDetails, seed, output, posterBooks],
  );
  const [savedJob, setSavedJob] = useState(job);
  if (savedJob !== job) {
    setSavedJob(job);
    setSaved(new Set());
    setProgress('');
  }
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (saving.current) {
        abort.current = true;
        return true;
      }
      if (choosing) {
        setChoosing(false);
        return true;
      }
      if (panel === 'settings') {
        setPanel('actions');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [choosing, panel]);
  const applyRange = useCallback(
    (next: DateRange) => {
      setRange(next);
      setExcluded(new Set());
      setPage(0);
      setRangeOpen(false);
    },
    [setRangeOpen],
  );
  const closeRange = useCallback(() => setRangeOpen(false), [setRangeOpen]);
  const duration = (value: number) => {
    const parts = durationParts(value);
    return parts.hours ? t('statistics.hours', parts) : t('statistics.minutes', parts);
  };
  const fallback = prepared?.filter((b) => !b.coverUri).length ?? 0;
  const canExport = !!document?.bookCount && !preparing && fontReady && !fontError && !busy;
  const defaultTitle =
    range.start.endsWith('-01-01') && range.start.slice(0, 4) === range.end.slice(0, 4)
      ? t('statistics.posterYearTitle', { year: range.start.slice(0, 4) })
      : t('statistics.posterTitleDefault');
  async function exportImages(action: 'all' | 'current' | 'share') {
    if (!canExport || !document || saving.current) return;
    saving.current = true;
    abort.current = false;
    setBusy(true);
    setDenied(false);
    Keyboard.dismiss();
    const completed = new Set(saved);
    const restorePage = actualPage;
    try {
      if (action !== 'share') await requestPosterPhotoPermission();
      const pages = action === 'all' ? document.pages.map((_, i) => i).filter((i) => !completed.has(i)) : [actualPage];
      await exportPosterPages({
        pages,
        completed,
        cancelled: () => abort.current,
        capture: async (i) => {
          setProgress(t('statistics.posterSaving', { page: i + 1, total: document.pages.length }));
          setPage(i);
          const deadline = Date.now() + 5000;
          while (canvas.current?.page !== i) {
            if (abort.current || Date.now() > deadline) throw Error('Poster preview is unavailable');
            await delay(40);
          }
          await delay(60);
          return canvas.current.snapshot();
        },
        write: writePosterImage,
        deliver: (uri) =>
          action === 'share' ? sharePosterImage(uri, t('statistics.posterEditor')) : savePosterImage(uri),
        remove: action === 'share' ? async () => {} : removePosterImage,
        onSaved: (pages) => {
          if (mounted.current && action !== 'share') setSaved(new Set(pages));
        },
      });
      if (mounted.current && action !== 'share') {
        setProgress(t('statistics.posterSaved', { count: completed.size }));
        if (!abort.current)
          toast.show({ variant: 'success', label: t('statistics.posterSaved', { count: completed.size }) });
      }
    } catch (error) {
      if (mounted.current) {
        if (abort.current) {
          setProgress(t('statistics.posterSaved', { count: completed.size }));
        } else if (error instanceof PosterPermissionError) {
          setDenied(!error.canAskAgain);
          toast.show({ variant: 'danger', label: t('statistics.posterPermission') });
        } else {
          toast.show({ variant: 'danger', label: t('statistics.posterFailed') });
          setProgress(t('statistics.posterSaved', { count: completed.size }));
        }
      }
    } finally {
      saving.current = false;
      if (mounted.current) {
        setBusy(false);
        setPage(restorePage);
      }
    }
  }
  if (choosing)
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View className="gap-3 px-4 py-3">
          <Button variant="ghost" onPress={() => setChoosing(false)}>
            {t('statistics.posterBack')}
          </Button>
          <Text className="text-xl font-semibold text-foreground">{t('statistics.posterChooseBooks')}</Text>
          <View className="flex-row gap-3">
            <Button variant="secondary" onPress={() => setSelection(new Set())}>
              {t('statistics.posterAll')}
            </Button>
            <Button variant="secondary" onPress={() => setSelection(new Set(period?.books.map((b) => b.id)))}>
              {t('statistics.posterNone')}
            </Button>
          </View>
        </View>
        <FlatList
          data={period?.books ?? []}
          keyExtractor={(book) => book.id}
          extraData={selection}
          initialNumToRender={12}
          windowSize={5}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          renderItem={({ item: book }) => (
            <PressableFeedback
              accessibilityRole="checkbox"
              accessibilityLabel={book.title}
              accessibilityState={{ checked: !selection.has(book.id) }}
              className="min-h-20 flex-row items-center gap-3 border-b border-separator py-3"
              onPress={() =>
                setSelection((previous) => {
                  const next = new Set(previous);
                  if (next.has(book.id)) next.delete(book.id);
                  else next.add(book.id);
                  return next;
                })
              }>
              <StyledCoverImage
                source={book.coverUri ? { uri: book.coverUri } : undefined}
                className="h-14 w-10 rounded-md bg-default"
                contentFit="cover"
              />
              <Text className="text-lg text-navigation-active">{selection.has(book.id) ? '○' : '✓'}</Text>
              <View className="min-w-0 flex-1 gap-1">
                <Text numberOfLines={2} className="text-sm text-foreground">
                  {book.title}
                </Text>
                <Text numberOfLines={1} className="text-xs text-muted">
                  {book.author || t('statistics.posterUnknownAuthor')}
                </Text>
              </View>
            </PressableFeedback>
          )}
        />
        <View className="gap-2 bg-surface p-4">
          <Text className="text-xs text-muted">
            {t('statistics.posterBooks', {
              selected: (period?.books.length ?? 0) - selection.size,
              total: period?.books.length ?? 0,
            })}
          </Text>
          <Button
            onPress={() => {
              setExcluded(new Set(selection));
              setPage(0);
              setChoosing(false);
            }}>
            {t('statistics.posterApply')}
          </Button>
        </View>
      </View>
    );
  const previewReady = readyPreview === `${job}:${actualPage}`;
  const pageCount = document?.pages.length ?? 0;
  const savedAll = pageCount > 0 && saved.size === pageCount;
  const presets = [
    { key: 'current', label: t('statistics.posterRangeCurrent'), range: original },
    ...RANGE_PRESETS.map((kind) => ({
      key: kind,
      label: t(RANGE_PRESET_LABELS[kind]),
      range: posterPreset(today, kind),
    })),
  ];
  const customRange = !presets.some((preset) => preset.range.start === range.start && preset.range.end === range.end);
  const actions = busy ? (
    <View className="gap-3 px-5 py-4">
      {!!progress && (
        <Text accessibilityLiveRegion="polite" className="text-center text-sm text-muted">
          {progress}
        </Text>
      )}
      <Button
        variant="secondary"
        onPress={() => {
          abort.current = true;
        }}>
        {t('statistics.posterCancel')}
      </Button>
    </View>
  ) : (
    <View className="gap-1 pt-1">
      {!!progress && (
        <Text accessibilityLiveRegion="polite" className="px-5 text-center text-xs text-muted">
          {progress}
        </Text>
      )}
      {denied && (
        <Button size="sm" variant="ghost" onPress={() => void Linking.openSettings()}>
          <Button.Label className="text-navigation-active">{t('statistics.posterSettings')}</Button.Label>
        </Button>
      )}
      <View className="flex-row items-center px-2">
        <PosterAction
          icon={{ ios: 'slider.horizontal.3', android: 'tune', web: 'tune' }}
          label={t('statistics.posterStyle')}
          onPress={() => setPanel('settings')}
        />
        <PosterAction
          icon={{ ios: 'crop', android: 'crop', web: 'crop' }}
          label={t('statistics.posterCropTitle')}
          disabled={!previewReady || !document?.pages[actualPage].tiles.some((tile) => tile.book.coverUri)}
          onPress={() => canvas.current?.edit()}
        />
        <PosterAction
          icon={{ ios: 'arrow.down', android: 'file_download', web: 'file_download' }}
          label={t(
            savedAll
              ? 'statistics.posterSavedAll'
              : saved.size
                ? 'statistics.posterRetry'
                : pageCount > 1
                  ? 'statistics.posterSaveAll'
                  : 'statistics.posterSave',
          )}
          disabled={!canExport || savedAll}
          onPress={() => void exportImages('all')}
        />
        <PosterAction
          icon={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }}
          label={t('statistics.posterShare')}
          disabled={!canExport}
          onPress={() => void exportImages('share')}
        />
      </View>
    </View>
  );
  const settings = (
    <View style={{ maxHeight: height * 0.55 }}>
      <View className="flex-row items-center justify-between px-3 pb-1">
        <Button
          accessibilityLabel={t('statistics.posterBackToActions')}
          isIconOnly
          onPress={() => setPanel('actions')}
          size="sm"
          variant="ghost">
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
            size={21}
            tintColor={iconColor}
          />
        </Button>
        <Text accessibilityRole="header" className="text-lg font-semibold text-foreground">
          {t('statistics.posterStyle')}
        </Text>
        <Button onPress={() => setPanel('actions')} size="sm" variant="ghost">
          <Button.Label className="text-navigation-active">{t('statistics.posterCropApply')}</Button.Label>
        </Button>
      </View>
      <ScrollView
        ref={editor}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="gap-5 px-5 pb-6 pt-2">
        <PosterOptionSection label={t('statistics.dateRange')}>
          <PosterOptionRow>
            {presets.map((preset) => (
              <PosterOption
                key={preset.key}
                label={preset.label}
                selected={preset.range.start === range.start && preset.range.end === range.end}
                onPress={() => applyRange(preset.range)}
              />
            ))}
            <PosterOption
              label={customRange ? `${range.start} → ${range.end}` : t('statistics.customRange')}
              selected={customRange}
              onPress={() => setRangeOpen(true)}
            />
          </PosterOptionRow>
        </PosterOptionSection>
        <PosterOptionSection label={t('statistics.posterLayout')}>
          <PosterOptionRow>
            {(['single', 'long', 'pages'] as const).map((value) => (
              <PosterOption
                key={value}
                label={t(OUTPUT_LABELS[value])}
                selected={output === value}
                onPress={() => {
                  setOutput(value);
                  setPage(0);
                }}
              />
            ))}
            <PosterOption
              label={t('statistics.posterShuffle')}
              onPress={() => {
                setSeed((value) => value + 1);
                setPage(0);
              }}
            />
          </PosterOptionRow>
          <Text className="px-1 text-xs text-muted">{t('statistics.posterHint')}</Text>
        </PosterOptionSection>
        <PosterOptionSection label={t('statistics.posterContent')}>
          <View className="overflow-hidden rounded-2xl bg-background dark:bg-surface-secondary">
            <PressableFeedback
              accessibilityRole="button"
              accessibilityLabel={t('statistics.posterChooseBooks')}
              className="min-h-14 flex-row items-center justify-between gap-3 px-4"
              onPress={() => {
                setSelection(new Set(excluded));
                setChoosing(true);
              }}>
              <Text className="text-base text-foreground">{t('statistics.posterChooseBooks')}</Text>
              <Text className="text-sm text-muted">
                {selected?.length ?? 0} / {period?.books.length ?? 0} ›
              </Text>
            </PressableFeedback>
            <ControlField
              accessibilityLabel={t('statistics.posterBookDetails')}
              accessibilityRole="switch"
              accessibilityState={{ checked: showBookDetails }}
              className="min-h-14 flex-row items-center justify-between gap-3 px-4"
              isSelected={showBookDetails}
              onSelectedChange={setShowBookDetails}>
              <Text className="text-base text-foreground">{t('statistics.posterBookDetails')}</Text>
              <ControlField.Indicator>
                <Switch className="h-7 w-12" accessibilityElementsHidden>
                  <Switch.Thumb className="size-5" />
                </Switch>
              </ControlField.Indicator>
            </ControlField>
          </View>
        </PosterOptionSection>
        <PosterOptionSection label={t('statistics.posterText')}>
          <TextField>
            <Label>{t('statistics.posterTitleLabel')}</Label>
            <Input
              accessibilityLabel={t('statistics.posterTitleLabel')}
              value={title}
              onChangeText={setTitle}
              onFocus={focusEditor}
              placeholder={defaultTitle}
              maxLength={20}
            />
          </TextField>
          <TextField>
            <Label>{t('statistics.posterQuoteLabel')}</Label>
            <Input
              accessibilityLabel={t('statistics.posterQuoteLabel')}
              value={quote}
              onChangeText={setQuote}
              onFocus={focusEditor}
              maxLength={40}
            />
          </TextField>
          <Text className="px-1 text-xs text-muted">{t('statistics.posterPrivacy')}</Text>
        </PosterOptionSection>
      </ScrollView>
    </View>
  );
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
      <View className="flex-row items-center gap-2 px-3 py-1">
        <Button
          accessibilityLabel={t('statistics.posterBack')}
          isDisabled={busy}
          isIconOnly
          onPress={() => router.back()}
          size="sm"
          variant="ghost">
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
            size={21}
            tintColor={iconColor}
          />
        </Button>
        <View className="min-w-0 flex-1 items-center">
          <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
            {t('statistics.posterEditor')}
          </Text>
          {document?.bookCount ? (
            <Text className="text-xs text-muted">
              {t('statistics.posterImageCount', { count: document.bookCount, pages: document.pages.length })}
            </Text>
          ) : null}
        </View>
        <View className="size-9" />
      </View>
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="grow items-center justify-center gap-3 px-4 py-4">
        {loadError || fontError || prepareFailed ? (
          <View className="items-center gap-3">
            <Text className="text-danger">{t('statistics.posterLoadFailed')}</Text>
            <Button
              variant="secondary"
              onPress={() => {
                setLoadError(false);
                setRevision((v) => v + 1);
              }}>
              {t('statistics.retry')}
            </Button>
          </View>
        ) : (preparing && !loadError) || (!fontReady && !fontError) ? (
          <View className="items-center gap-2">
            <ActivityIndicator />
            <Text className="text-sm text-muted">{t('statistics.posterPreparing')}</Text>
          </View>
        ) : document && document.bookCount > 0 ? (
          <>
            <PosterCanvas
              key={`${job}:${actualPage}`}
              ref={canvas}
              document={document}
              page={actualPage}
              width={Math.min(width - insets.left - insets.right - 32, 600)}
              labels={{
                showBookDetails,
                title: title.trim() || defaultTitle,
                quote,
                range: `${range.start} — ${range.end}`,
                total: t('statistics.posterTotal', { count: document.bookCount, time: duration(document.total) }),
                unknownAuthor: t('statistics.posterUnknownAuthor'),
                page: document.pages.length > 1 ? `${actualPage + 1} / ${document.pages.length}` : '',
              }}
              onOpen={(uri, origin) => {
                if (!saving.current) setPreview({ uri, origin });
              }}
              onReady={(ready) => setReadyPreview(ready ? `${job}:${actualPage}` : '')}
              onEdit={(uri, labels, tile) => {
                if (!saving.current) setCropEditor({ uri, labels, initialId: tile?.book.id });
              }}
            />
            {document.pages.length > 1 && (
              <View className="flex-row items-center gap-4">
                <Button
                  accessibilityLabel={t('statistics.posterPrevious')}
                  isDisabled={busy || actualPage === 0}
                  isIconOnly
                  onPress={() => setPage((p) => p - 1)}
                  size="sm"
                  variant="ghost">
                  <SymbolView
                    name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }}
                    size={18}
                    tintColor={iconColor}
                  />
                </Button>
                <Text className="text-sm text-muted">
                  {actualPage + 1} / {document.pages.length}
                </Text>
                <Button
                  accessibilityLabel={t('statistics.posterNext')}
                  isDisabled={busy || actualPage >= document.pages.length - 1}
                  isIconOnly
                  onPress={() => setPage((p) => p + 1)}
                  size="sm"
                  variant="ghost">
                  <SymbolView
                    name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                    size={18}
                    tintColor={iconColor}
                  />
                </Button>
              </View>
            )}
          </>
        ) : (
          <Text className="text-sm text-muted">{t('statistics.posterEmptySelection')}</Text>
        )}
        {!!fallback && (
          <Text className="text-center text-xs text-muted">
            {t('statistics.posterCoverFallback', { count: fallback })}
          </Text>
        )}
      </ScrollView>
      <View className="rounded-t-3xl bg-surface pt-2" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        <View className="mb-1 h-1 w-9 self-center rounded-full bg-default" />
        {panel === 'settings' && !busy ? settings : actions}
      </View>
      {cropEditor && document && (
        <PosterCoverEditor
          page={document.pages[actualPage]}
          {...cropEditor}
          crops={crops}
          onCancel={() => setCropEditor(undefined)}
          onApply={(next) => {
            setCrops(next);
            setCropEditor(undefined);
          }}
        />
      )}
      {preview && (
        <ImageViewer
          uri={preview.uri}
          origin={preview.origin}
          viewport={{ width, height }}
          allowDownscaling={false}
          description={t('statistics.posterEditor')}
          closeLabel={t('action.close')}
          onClose={() => setPreview(undefined)}
          onError={() => setPreview(undefined)}
        />
      )}
      <DateRangeSheet range={range} today={today} isOpen={rangeOpen} onClose={closeRange} onApply={applyRange} />
    </KeyboardAvoidingView>
  );
}
