export type ReaderTheme = 'light' | 'dark' | 'paper';

export type ReaderSpreadMode = 'single' | 'double';

export interface ReaderViewport {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

export interface ReaderContentInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface ReaderTypography {
  readonly fontFamily?: string;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly marginHorizontal: number;
  readonly marginVertical: number;
  readonly spreadMode: ReaderSpreadMode;
}
