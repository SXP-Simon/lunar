export type ReaderTheme = 'light' | 'dark' | 'paper';

export type ReaderSpreadMode = 'single' | 'double';

export interface ReaderViewport {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

export interface ReaderTypography {
  readonly fontFamily?: string;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly marginHorizontal: number;
  readonly marginVertical: number;
  readonly spreadMode: ReaderSpreadMode;
}

export interface ReaderSourcePoint {
  readonly nodePath: readonly number[];
  readonly textOffset: number;
}

export interface ReaderLocator {
  readonly spineIdref: string;
  readonly manifestHref?: string;
  readonly chapterProgress: number;
  readonly sourcePoint?: ReaderSourcePoint;
}

export interface ReaderPosition {
  readonly locator?: ReaderLocator;
  readonly progression: number;
  readonly pageIndex: number;
  readonly spreadIndex: number;
  readonly timestamp: number;
}

export interface ReaderTocEntry {
  readonly label: string;
  readonly href: string;
  readonly children: readonly ReaderTocEntry[];
}

export interface ReaderBookMetadata {
  readonly title: string;
  readonly language: string;
  readonly identifier: string;
  readonly creator?: string;
}

export interface ReaderOpenRequest {
  readonly bookId: string;
  readonly fileUri: string;
  readonly viewport: ReaderViewport;
  readonly typography: ReaderTypography;
  readonly theme: ReaderTheme;
  readonly restorePosition?: ReaderPosition;
}

export interface ReaderLayoutRequest {
  readonly viewport: ReaderViewport;
  readonly typography: ReaderTypography;
  readonly theme: ReaderTheme;
}

export type ReaderPhase =
  | 'idle'
  | 'opening'
  | 'paginating'
  | 'ready'
  | 'reflowing'
  | 'closing'
  | 'error';

export interface ReaderSnapshot {
  readonly phase: ReaderPhase;
  readonly bookId?: string;
  readonly revisionId: number;
  readonly spreadIndex: number;
  readonly totalSpreads?: number;
  readonly position?: ReaderPosition;
}

export interface ReaderOpenResult {
  readonly metadata: ReaderBookMetadata;
  readonly toc: readonly ReaderTocEntry[];
  readonly snapshot: ReaderSnapshot;
}
