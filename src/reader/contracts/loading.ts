import type { ReaderBookMetadata, ReaderLayoutRequest, ReaderTocEntry } from './reader';

export interface ReaderFontShorthand {
  readonly style: 'normal' | 'italic';
  readonly weight: number;
  readonly sizePx: number;
  readonly family: string;
}

export interface ReaderMeasurePaint {
  readonly font: ReaderFontShorthand;
  readonly wordSpacingPx?: number;
  readonly letterSpacingPx?: number;
}

export interface ReaderTextMetrics {
  readonly width: number;
  readonly height: number;
}

export interface ReaderTextMeasurer {
  measureText(text: string, paint: ReaderMeasurePaint): ReaderTextMetrics;
}

export interface ReaderFontMetrics {
  readonly ascentPx: number;
  readonly descentPx: number;
  readonly lineGapPx: number;
  readonly contentHeightPx: number;
}

export interface ReaderFontMetricsProvider {
  resolveFontMetrics(paint: ReaderMeasurePaint): ReaderFontMetrics;
}

export interface ReaderFontResource {
  readonly family: string;
  readonly src: string;
  readonly bytes: Uint8Array;
  readonly weight?: string;
  readonly style?: string;
}

export interface ReaderFontRegistry {
  loadFont(resource: ReaderFontResource): Promise<void>;
  dispose?(): void;
}

export interface ReaderImageDimensions {
  readonly width: number;
  readonly height: number;
}

export interface ReaderImageResource {
  readonly href: string;
  readonly bytes: Uint8Array;
}

export interface ReaderImageDecoder<TImage extends ReaderImageDimensions = ReaderImageDimensions> {
  decode(resource: ReaderImageResource): Promise<TImage>;
  dispose(image: TImage): void;
}

export interface ReaderRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ReaderPoint {
  readonly x: number;
  readonly y: number;
}

export interface ReaderSize {
  readonly width: number;
  readonly height: number;
}

export type ReaderLength =
  | { readonly unit: 'px'; readonly value: number }
  | { readonly unit: 'percent'; readonly value: number };

export type ReaderTransform =
  | {
      readonly kind: 'translate';
      readonly x: ReaderLength;
      readonly y: ReaderLength;
    }
  | { readonly kind: 'scale'; readonly sx: number; readonly sy: number }
  | { readonly kind: 'rotate'; readonly rad: number };

export type ReaderPaint = Readonly<Record<string, unknown>>;

export type ReaderDrawCommand =
  | { readonly kind: 'pushState' }
  | { readonly kind: 'popState' }
  | { readonly kind: 'translate'; readonly dx: number; readonly dy: number }
  | {
      readonly kind: 'transform';
      readonly origin: ReaderPoint;
      readonly box: ReaderSize;
      readonly transforms: readonly ReaderTransform[];
    }
  | { readonly kind: 'opacity'; readonly value: number }
  | {
      readonly kind: 'clipRect';
      readonly rect: ReaderRect;
      readonly radius?: { readonly rx: number; readonly ry: number };
    }
  | { readonly kind: 'paintPage'; readonly rect: ReaderRect; readonly paint: ReaderPaint }
  | {
      readonly kind: 'paintBlock';
      readonly rect: ReaderRect;
      readonly paint: ReaderPaint;
      readonly borderBox?: unknown;
    }
  | {
      readonly kind: 'paintText';
      readonly text: string;
      readonly rect: ReaderRect;
      readonly paint: ReaderPaint;
      readonly lineHeightPx?: number;
      readonly href?: string;
      readonly sourceText?: string;
      readonly sourceTextOffset?: number;
    }
  | {
      readonly kind: 'paintRuby';
      readonly text: string;
      readonly rect: ReaderRect;
      readonly paint: ReaderPaint;
    }
  | {
      readonly kind: 'paintImage';
      readonly src: string;
      readonly rect: ReaderRect;
      readonly alt?: string;
      readonly href?: string;
    }
  | {
      readonly kind: 'paintHorizontalRule';
      readonly rect: ReaderRect;
      readonly paint: ReaderPaint;
    };

export type ReaderDrawCommandKind = ReaderDrawCommand['kind'];

export interface ReaderDisplayList {
  readonly width: number;
  readonly height: number;
  readonly commands: readonly ReaderDrawCommand[];
}

export interface ReaderRenderPalette {
  readonly backgroundColor: string;
  readonly foregroundColor: string;
  readonly spreadBodyBackgroundColor: string;
}

export interface ReaderLayoutParameters {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly pixelRatio: number;
  readonly marginTop: number;
  readonly marginRight: number;
  readonly marginBottom: number;
  readonly marginLeft: number;
  readonly spreadMode: 'single' | 'double';
  readonly spreadGap: number;
  readonly rootFontSize: number;
  readonly lineHeight?: number;
  readonly fontFamily?: string;
  readonly palette: ReaderRenderPalette;
}

export interface ReaderChapterRange {
  readonly spineIdref: string;
  readonly startPage: number;
  readonly endPage: number;
}

export interface ReaderChapterTiming {
  readonly chapterIndex: number;
  readonly pageCount: number;
  readonly durationMs: number;
}

export interface ReaderRenderFrame {
  readonly spreadIndex: number;
  readonly pageIndices: readonly number[];
  readonly width: number;
  readonly height: number;
  readonly imageSources: readonly string[];
  readonly displayList: ReaderDisplayList;
}

export interface LoadedReaderPublication {
  readonly metadata: ReaderBookMetadata;
  readonly toc: readonly ReaderTocEntry[];
  readonly layout: ReaderLayoutParameters;
  readonly totalPages: number;
  readonly totalSpreads: number;
  readonly chapters: readonly ReaderChapterRange[];
  readonly chapterTimings: readonly ReaderChapterTiming[];
  getFrame(spreadIndex: number): ReaderRenderFrame | undefined;
  getImage(source: string): Uint8Array | undefined;
  close(): void;
}

export interface LoadReaderPublicationOptions<
  TImage extends ReaderImageDimensions = ReaderImageDimensions,
> {
  readonly data: ArrayBuffer;
  readonly layout: ReaderLayoutRequest;
  readonly textMeasurer: ReaderTextMeasurer;
  readonly fontRegistry?: ReaderFontRegistry;
  readonly imageDecoder?: ReaderImageDecoder<TImage>;
  readonly imageDecodeConcurrency?: number;
  readonly lineBreaking?: 'greedy' | 'optimal';
  readonly signal?: AbortSignal;
  readonly onChapterPaginated?: (timing: ReaderChapterTiming) => void;
}
