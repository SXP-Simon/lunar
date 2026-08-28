import type { ReaderBookMetadata, ReaderLayoutRequest, ReaderLocator, ReaderSourcePoint, ReaderTocEntry } from './reader';

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
  /** Rito's shape fingerprint lets the registry share immutable faces. */
  readonly fingerprint?: string;
  readonly byteLength?: number;
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

export type ReaderColorSpace =
  | 'srgb' | 'hsl' | 'hwb' | 'lab' | 'lch' | 'oklab' | 'oklch'
  | 'srgb-linear' | 'display-p3' | 'display-p3-linear' | 'a98-rgb'
  | 'prophoto-rgb' | 'rec2020' | 'xyz-d50' | 'xyz-d65';

export interface ReaderColor {
  readonly space: ReaderColorSpace;
  readonly components: readonly [number, number, number];
  readonly alpha: number;
  readonly none: { readonly component0: boolean; readonly component1: boolean; readonly component2: boolean; readonly alpha: boolean };
}

export type ReaderTransform =
  | {
      readonly kind: 'translate';
      readonly x: ReaderLength;
      readonly y: ReaderLength;
    }
  | { readonly kind: 'scale'; readonly sx: number; readonly sy: number }
  | { readonly kind: 'rotate'; readonly rad: number };

export type ReaderBorderStyle = 'none' | 'hidden' | 'solid' | 'dotted' | 'dashed' | 'double' | 'groove' | 'ridge' | 'inset' | 'outset';

export interface ReaderBorderPaintEdge {
  readonly color: ReaderColor | string;
  readonly style: ReaderBorderStyle;
}

export interface ReaderBorderBox {
  readonly topWidth: number;
  readonly rightWidth: number;
  readonly bottomWidth: number;
  readonly leftWidth: number;
}

export interface ReaderSpacing {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface ReaderRunBorderEdge {
  readonly widthPx: number;
  readonly paint: ReaderBorderPaintEdge;
}

export interface ReaderRunBorder {
  readonly top?: ReaderRunBorderEdge;
  readonly bottom?: ReaderRunBorderEdge;
  readonly start?: ReaderRunBorderEdge;
  readonly end?: ReaderRunBorderEdge;
}

export interface ReaderTextShadow {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly blur: number;
  readonly color: ReaderColor | string;
}

export interface ReaderBoxShadow extends ReaderTextShadow {
  readonly spread: number;
  readonly inset: boolean;
}

export type ReaderRunDecoration =
  | {
      readonly kind: 'underline';
      readonly y: number;
      readonly thickness: number;
      readonly color: ReaderColor | string;
    }
  | {
      readonly kind: 'line-through';
      readonly y: number;
      readonly thickness: number;
      readonly color: ReaderColor | string;
    };

export interface ReaderRunPaint extends ReaderMeasurePaint {
  readonly color: ReaderColor | string;
  readonly backgroundColor?: ReaderColor | string;
  readonly backgroundRadius?: number;
  readonly textShadow?: readonly ReaderTextShadow[];
  readonly decoration?: ReaderRunDecoration;
  readonly padding?: ReaderSpacing;
  readonly border?: ReaderRunBorder;
}

export interface ReaderBackgroundPosition {
  readonly x: ReaderLength;
  readonly y: ReaderLength;
}

export interface ReaderBlockPaint {
  readonly background?: {
    readonly color?: ReaderColor | string;
    readonly image?: string;
    readonly size?: 'cover' | 'contain' | 'auto';
    readonly repeat?: 'repeat' | 'no-repeat' | 'repeat-x' | 'repeat-y' | 'space' | 'round';
    readonly position?: ReaderBackgroundPosition;
  };
  readonly border?: {
    readonly top?: ReaderBorderPaintEdge;
    readonly right?: ReaderBorderPaintEdge;
    readonly bottom?: ReaderBorderPaintEdge;
    readonly left?: ReaderBorderPaintEdge;
  };
  readonly radius?: { readonly px?: number; readonly pct?: number; readonly corners?: { readonly topLeft: number; readonly topRight: number; readonly bottomRight: number; readonly bottomLeft: number } };
  readonly boxShadow?: readonly ReaderBoxShadow[];
}

export interface ReaderPagePaint {
  readonly backgroundColor?: ReaderColor | string;
}

export interface ReaderHorizontalRulePaint {
  readonly color: ReaderColor | string;
  readonly style: ReaderBorderStyle;
}

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
  | { readonly kind: 'paintPage'; readonly rect: ReaderRect; readonly paint: ReaderPagePaint }
  | {
      readonly kind: 'paintBlock';
      readonly rect: ReaderRect;
      readonly paint: ReaderBlockPaint;
      readonly borderBox?: ReaderBorderBox;
    }
  | {
      readonly kind: 'paintText';
      readonly text: string;
      readonly rect: ReaderRect;
      readonly paint: ReaderRunPaint;
      readonly lineHeightPx?: number;
      readonly href?: string;
      readonly sourceText?: string;
      readonly sourceTextOffset?: number;
      readonly vertical?: boolean;
    }
  | {
      readonly kind: 'paintRuby';
      readonly text: string;
      readonly rect: ReaderRect;
      readonly paint: ReaderRunPaint;
      readonly lineHeightPx?: number;
      readonly href?: string;
      readonly sourceText?: string;
      readonly sourceTextOffset?: number;
      readonly rubyAlign?: 'space-around' | 'start' | 'center' | 'space-between';
      readonly vertical?: boolean;
    }
  | {
      readonly kind: 'paintImage';
      readonly src: string;
      readonly rect: ReaderRect;
      readonly alt?: string;
      readonly href?: string;
      /** Optional raster-pixel subregion declared by Rito RITODL1 V1. */
      readonly sourceRect?: ReaderRect;
    }
  | {
      readonly kind: 'paintHorizontalRule';
      readonly rect: ReaderRect;
      readonly paint: ReaderHorizontalRulePaint;
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
  /** Stable artifact identity used to validate cached frames and Pictures. */
  readonly sourceKey?: string;
  readonly pageIndices: readonly number[];
  readonly width: number;
  readonly height: number;
  readonly imageSources: readonly string[];
  readonly displayList: ReaderDisplayList;
  readonly hits?: readonly ReaderHitEntry[];
  readonly semantics?: readonly ReaderSemanticNode[];
  readonly text?: string;
}

export interface ReaderTextPosition {
  readonly blockIndex: number;
  readonly lineIndex: number;
  readonly runIndex: number;
  readonly charIndex: number;
}

export interface ReaderTextRangeGeometryRequest {
  readonly pageIndex: number;
  readonly start: ReaderTextPosition;
  readonly end: ReaderTextPosition;
}

export interface ReaderTextRangeRect {
  readonly bounds: ReaderRect;
  readonly blockIndex: number;
  readonly lineIndex: number;
  readonly runIndex: number;
  readonly startCharIndex: number;
  readonly endCharIndex: number;
}

export interface ReaderSearchRequest {
  readonly query: string;
  readonly caseSensitive?: boolean;
  readonly wholeWord?: boolean;
  readonly limit?: number;
}

export interface ReaderSearchResult {
  readonly pageIndex: number;
  readonly spreadIndex: number;
  readonly start: ReaderTextPosition;
  readonly end: ReaderTextPosition;
  readonly context: string;
  readonly locator?: ReaderLocator;
}

export interface ReaderSearchResponse {
  readonly query: string;
  readonly truncated: boolean;
  readonly searchedPageCount: number;
  readonly scopeComplete: boolean;
  readonly results: readonly ReaderSearchResult[];
}

export interface ReaderHitEntry {
  readonly pageIndex: number;
  readonly bounds: ReaderRect;
  readonly text: string;
  readonly href?: string;
  readonly imageSource?: string;
  readonly imageAlt?: string;
  readonly footnoteKey?: string;
  readonly footnotePending?: boolean;
  readonly sourcePoint?: ReaderSourcePoint;
}

export type ReaderSemanticRole =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'listitem'
  | 'image'
  | 'link'
  | 'blockquote'
  | 'table'
  | 'generic';

export interface ReaderSemanticNode {
  readonly role: ReaderSemanticRole;
  readonly level?: number;
  readonly label?: string;
  readonly alt?: string;
  readonly href?: string;
  readonly bounds: ReaderRect;
  readonly children: readonly ReaderSemanticNode[];
}

export interface ReaderPublicationView {
  readonly metadata: ReaderBookMetadata;
  readonly toc: readonly ReaderTocEntry[];
  readonly layout: ReaderLayoutParameters;
  readonly totalPages: number;
  /** Total spreads once whole-book pagination has completed. */
  readonly totalSpreads?: number;
  readonly chapters: readonly ReaderChapterRange[];
  readonly chapterTimings: readonly ReaderChapterTiming[];
  readonly getCurrentChapterTitle?: () => string | undefined;
  /** Whole-book page number for the artifact currently assigned to a spread. */
  readonly getBookPageIndex?: (spreadIndex: number) => number | undefined;
  /** Durable source locator for the artifact currently assigned to a spread. */
  readonly getCurrentLocator?: (spreadIndex: number) => ReaderLocator | undefined;
  /** Reports whether the current artifact can produce an adjacent spread. */
  readonly canNavigate?: (direction: 'next' | 'previous') => boolean;
  /** Returns the render slot for an adjacent turn, rebasing private slots when needed. */
  readonly getAdjacentSpreadIndex?: (currentSpreadIndex: number, direction: 'next' | 'previous') => number;
  getFrame(spreadIndex: number): ReaderRenderFrame | undefined;
  getImage(source: string): Uint8Array | undefined;
  /** Resolves a TOC target, paginating it on demand when necessary. */
  resolveToc(href: string): number | undefined | Promise<number | undefined>;
  resolveTextRangeGeometry?(request: ReaderTextRangeGeometryRequest): Promise<readonly ReaderTextRangeRect[]>;
  search?(request: ReaderSearchRequest): Promise<ReaderSearchResponse>;
}

export interface LoadedReaderPublication extends ReaderPublicationView {
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
