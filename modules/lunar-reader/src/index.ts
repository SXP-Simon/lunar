import { requireNativeModule } from 'expo-modules-core';

export interface NativeReaderArchiveOpenResult {
  readonly handleId: string;
  readonly bookHash: string;
}

export interface NativeReaderTextMeasureRequest {
  readonly text: string;
  readonly family: string;
  readonly weight: number;
  readonly style: 'normal' | 'italic';
  readonly sizePx: number;
  readonly letterSpacingPx?: number;
  readonly wordSpacingPx?: number;
}

export interface NativeReaderFontMetricsRequest {
  readonly family: string;
  readonly weight: number;
  readonly style: 'normal' | 'italic';
  readonly sizePx: number;
}

export interface NativeReaderArchiveSharedObject {
  readonly bookHash: string;
  readAll(): Uint8Array;
  readEntry(path: string): Uint8Array;
  hasEntry(path: string): boolean;
  close(): void;
}

export interface NativeReaderTextMeasurerSharedObject {
  measureText(request: NativeReaderTextMeasureRequest): {
    readonly width: number;
    readonly height: number;
  };
  resolveFontMetrics(request: NativeReaderFontMetricsRequest): {
    readonly ascentPx: number;
    readonly descentPx: number;
    readonly lineGapPx: number;
    readonly contentHeightPx: number;
  };
}

interface NativeReaderModule {
  openArchive(uri: string): Promise<NativeReaderArchiveOpenResult>;
  readArchiveEntry(handleId: string, path: string): Promise<Uint8Array>;
  hasArchiveEntry(handleId: string, path: string): boolean;
  closeArchive(handleId: string): void;
  measureText(request: NativeReaderTextMeasureRequest): {
    readonly width: number;
    readonly height: number;
  };
  resolveFontMetrics(request: NativeReaderFontMetricsRequest): {
    readonly ascentPx: number;
    readonly descentPx: number;
    readonly lineGapPx: number;
    readonly contentHeightPx: number;
  };
  installOnReaderWorkletRuntime?(runtimeHolder: object): boolean;
  ReaderArchive?: new (uri: string) => NativeReaderArchiveSharedObject;
  ReaderTextMeasurer?: new () => NativeReaderTextMeasurerSharedObject;
}

export const LunarReaderNative: NativeReaderModule | undefined = loadNativeModule();

function loadNativeModule(): NativeReaderModule | undefined {
  try {
    return requireNativeModule<NativeReaderModule>('LunarReader');
  } catch {
    return undefined;
  }
}
