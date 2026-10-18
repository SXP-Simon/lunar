import { expect, it, vi } from 'vitest';
import type { SkTypeface } from '@shopify/react-native-skia';
import { renderPoster } from '../../src/features/statistics/infrastructure/poster-renderer';
import { buildPoster, type PosterLabels } from '../../src/features/statistics/domain/poster';
const state = vi.hoisted(() => ({
  live: 0,
  maxLive: 0,
  drawn: 0,
  decoded: 0,
  snapshots: 0,
  surfaceDisposed: 0,
  failAt: -1,
  brand: false,
  brands: 0,
  texts: [] as string[],
  disposableFilters: false,
  filtersDisposed: 0,
  sources: [] as { x: number; y: number; width: number; height: number }[],
  radialGradients: [] as unknown[][],
  alpha: [] as number[],
}));
vi.mock('../../src/features/statistics/infrastructure/poster-brand', () => ({
  loadPosterBrand: async () => (state.brand ? { brand: true } : null),
}));
vi.mock('expo-asset', () => ({ Asset: { fromModule: vi.fn() } }));
vi.mock('../../src/features/statistics/infrastructure/poster-background', () => ({ drawAmbientBackground: vi.fn() }));
vi.mock('@shopify/react-native-skia', () => {
  const noop = () => {};
  const paint = () => ({
    setAntiAlias: noop,
    setShader: noop,
    setColor: noop,
    setAlphaf: (alpha: number) => state.alpha.push(alpha),
    setStrokeWidth: noop,
    setColorFilter: noop,
    setMaskFilter: noop,
    setStyle: noop,
    dispose: noop,
  });
  const canvas = {
    scale: noop,
    save: noop,
    clipRect: noop,
    clipPath: noop,
    restore: noop,
    clear: noop,
    drawRect: noop,
    drawLine: noop,
    drawCircle: noop,
    drawText: (value: string) => state.texts.push(value),
    drawImageRectCubic: (
      image: { brand?: boolean },
      source: { x: number; y: number; width: number; height: number },
    ) => {
      if (image.brand) {
        state.brands++;
        return;
      }
      state.drawn++;
      state.sources.push(source);
    },
  };
  return {
    BlendMode: { SrcIn: 1 },
    BlurStyle: { Normal: 0 },
    PaintStyle: { Fill: 0, Stroke: 1 },
    TileMode: { Clamp: 0 },
    ClipOp: { Intersect: 0 },
    Skia: {
      Color: (s: string) => s,
      XYWHRect: (x: number, y: number, width: number, height: number) => ({ x, y, width, height }),
      Paint: paint,
      Path: { Circle: () => ({ dispose: noop }) },
      Font: () => ({ setSize: noop, getGlyphIDs: () => [], getGlyphWidths: () => [], dispose: noop }),
      MaskFilter: {
        MakeBlur: () => (state.disposableFilters ? { dispose: () => state.filtersDisposed++ } : {}),
      },
      ColorFilter: { MakeBlend: () => ({ dispose: noop }) },
      Shader: {
        MakeLinearGradient: () => ({ dispose: noop }),
        MakeRadialGradient: (...args: unknown[]) => {
          state.radialGradients.push(args);
          return { dispose: noop };
        },
      },
      Data: { fromURI: async () => ({ dispose: noop }) },
      Image: {
        MakeImageFromEncoded: () => {
          state.decoded++;
          if (state.decoded === state.failAt) return null;
          state.live++;
          state.maxLive = Math.max(state.maxLive, state.live);
          return {
            width: () => 400,
            height: () => 600,
            dispose: () => {
              state.live--;
            },
          };
        },
      },
      Surface: {
        Make: () => ({
          getCanvas: () => canvas,
          flush: noop,
          dispose: () => {
            state.surfaceDisposed++;
          },
          makeImageSnapshot: () => {
            state.snapshots++;
            expect(state.live).toBe(0);
            return { encodeToBase64: () => 'PNG', dispose: noop };
          },
        }),
      },
    },
  };
});
const source = Array.from({ length: 120 }, (_, i) => ({
  id: String(i),
  title: `书 ${i}`,
  author: '作者',
  coverUri: `file:///${i}.png`,
  milliseconds: 60000,
}));
const labels: PosterLabels = {
  title: '年记',
  quote: '书页',
  range: '2025-01-01 — 2025-12-31',
  total: '120 本',
  unknownAuthor: '佚名',
  page: '1 / 1',
};
it('exports each selected crop instead of reverting to the original centered cover', async () => {
  Object.assign(state, { failAt: -1, sources: [] });
  const book = { ...source[0], crop: { x: 0, y: 1, zoom: 2 } };
  const page = buildPoster([book], 1, 'single').pages[0];
  await renderPoster(page, labels, { aborted: false }, {} as SkTypeface);
  const tile = page.tiles[0];
  const fit = Math.max(tile.width / 400, tile.height / 600) * 2;
  expect(state.sources).toEqual([
    { x: 0, y: 600 - tile.height / fit, width: tile.width / fit, height: tile.height / fit },
  ]);
});
it('draws the live editor overlay with the same captions, without decoding covers again', async () => {
  Object.assign(state, { failAt: -1, drawn: 0, decoded: 0, texts: [], brand: false });
  const page = buildPoster(source.slice(0, 6), 1, 'single').pages[0];
  await renderPoster(page, labels, { aborted: false }, {} as SkTypeface, true);
  expect(state.drawn).toBe(0);
  expect(state.decoded).toBe(0);
  for (const book of source.slice(0, 6)) expect(state.texts).toContain(book.title);
  expect(state.texts).not.toContain(labels.title);
  expect(state.texts).not.toContain('Lunar');
});
it('draws all 120 real covers sequentially before encoding, without an evictable image cache', async () => {
  Object.assign(state, { live: 0, maxLive: 0, drawn: 0, decoded: 0, snapshots: 0, surfaceDisposed: 0, failAt: -1 });
  const page = buildPoster(source, 1, 'long').pages[0];
  expect(page.tiles).toHaveLength(120);
  expect(await renderPoster(page, labels, { aborted: false }, {} as SkTypeface)).toBe('PNG');
  expect(state).toMatchObject({ drawn: 120, decoded: 120, maxLive: 1, live: 0, snapshots: 1, surfaceDisposed: 1 });
});
it('fails visibly instead of encoding a silently missing cover and releases the raster surface', async () => {
  Object.assign(state, { live: 0, maxLive: 0, drawn: 0, decoded: 0, snapshots: 0, surfaceDisposed: 0, failAt: 3 });
  await expect(
    renderPoster(buildPoster(source, 1, 'long').pages[0], labels, { aborted: false }, {} as SkTypeface),
  ).rejects.toThrow('Cover decode failed');
  expect(state).toMatchObject({ drawn: 2, live: 0, snapshots: 0, surfaceDisposed: 1 });
});

it('releases CanvasKit blur filters when supported, while native filters need no dispose method', async () => {
  Object.assign(state, { disposableFilters: true, filtersDisposed: 0, failAt: -1 });
  try {
    expect(
      await renderPoster(
        buildPoster(source.slice(0, 1), 1, 'single').pages[0],
        labels,
        { aborted: false },
        {} as SkTypeface,
      ),
    ).toBe('PNG');
    expect(state.filtersDisposed).toBe(2);
  } finally {
    state.disposableFilters = false;
  }
});

it('uses one restrained brand signature without template labels or decorative prose', async () => {
  Object.assign(state, {
    live: 0,
    maxLive: 0,
    drawn: 0,
    decoded: 0,
    snapshots: 0,
    surfaceDisposed: 0,
    failAt: -1,
    brand: true,
    brands: 0,
    texts: [],
  });
  await renderPoster(
    buildPoster(source.slice(0, 6), 1, 'single').pages[0],
    { ...labels, page: '' },
    { aborted: false },
    {} as SkTypeface,
  );
  expect(state.brands).toBe(2); // Soft halo plus the crisp signature, at the same position.
  expect(state.texts).toContain('Lunar');
  expect(state.texts.some((t) => /READING MOSAIC|阅读切片|翻过的页|慢慢成为风景|1 \/ 1/.test(t))).toBe(false);
  state.brand = false;
});

it('keeps edge shading identical in the editor and export, with a clear central plateau', async () => {
  for (const count of [6, 20, 60, 120]) {
    const page = buildPoster(source.slice(0, count), 1, 'single', true).pages[0];
    Object.assign(state, { failAt: -1, radialGradients: [], alpha: [] });
    await renderPoster(page, labels, { aborted: false }, {} as SkTypeface);
    const gradients = [...state.radialGradients];
    const alpha = [...state.alpha];
    expect(gradients).toHaveLength(count);
    for (const gradient of gradients) {
      expect(gradient[2]).toEqual(['#00000000', '#00000000', '#000000']);
      const stops = gradient[3] as number[];
      expect(stops[1]).toBeGreaterThan(0.3);
      expect(stops.at(-1)).toBe(1);
    }
    expect(alpha.filter((n) => n !== 1).every((n) => n > 0 && n < 0.8)).toBe(true);
    expect(alpha.at(-1)).toBe(1);
    Object.assign(state, { radialGradients: [], alpha: [] });
    await renderPoster(page, labels, { aborted: false }, {} as SkTypeface, true);
    expect(state.radialGradients).toEqual(gradients);
    expect(state.alpha).toEqual(alpha);
  }
});
