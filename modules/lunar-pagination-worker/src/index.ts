import { requireNativeModule } from 'expo';

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

interface NativePaginationWorkerModule {
  openArchive(uri: string): Promise<NativeReaderArchiveOpenResult>;
  readArchiveEntry(handleId: string, path: string): Promise<Uint8Array>;
  hasArchiveEntry(handleId: string, path: string): boolean;
  closeArchive(handleId: string): void;
  getBuiltinFontBytes(): Uint8Array;
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
}

export const LunarPaginationWorkerNative: NativePaginationWorkerModule | undefined = loadNativeModule();

function loadNativeModule(): NativePaginationWorkerModule | undefined {
  try {
    return requireNativeModule<NativePaginationWorkerModule>('LunarPaginationWorker');
  } catch {
    return undefined;
  }
}
