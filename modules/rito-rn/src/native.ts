import NativeRitoReader, {
  type NativeBufferResult,
  type NativePinnedFontFace,
  type Spec,
} from '../specs/NativeRitoReader';
import { RitoNativeError, RitoNativeModuleUnavailableError, type RitoNativeStatus } from './errors';
import { toExternalIdString } from './protocol/binary';

const perfConsole = console as Console & { timeStamp?: (label?: string) => void };

function nativePerfMark(label: string): void {
  if (process.env.EXPO_PUBLIC_READER_PERF === '1') {
    perfConsole.timeStamp?.(`[LunarReader] ${label}`);
  }
}

export type RitoNativePinnedFontFace = {
  readonly bytes: Uint8Array;
  readonly expectedSha256: string;
  readonly genericRole: 'serif' | 'sansSerif' | 'monospace';
  readonly language?: string;
};

export interface RitoNativeReaderModule {
  open(
    publication: Uint8Array,
    request: Uint8Array,
    fonts: readonly RitoNativePinnedFontFace[],
  ): Promise<RitoNativeCallResult>;
  readPublication(sessionId: bigint): Promise<RitoNativeCallResult>;
  requestArtifact(sessionId: bigint, request: Uint8Array): Promise<RitoNativeCallResult>;
  requestAdjacent(sessionId: bigint, request: Uint8Array): Promise<RitoNativeCallResult>;
  peekAdjacent(sessionId: bigint, request: Uint8Array): Promise<RitoNativeCallResult>;
  adoptForeground(sessionId: bigint, request: Uint8Array): Promise<RitoNativeCallResult>;
  commitPeekedArtifact(sessionId: bigint, request: Uint8Array): Promise<RitoNativeCallResult>;
  advanceBackground(sessionId: bigint, request: Uint8Array): Promise<RitoNativeCallResult>;
  adoptBackground(sessionId: bigint, request: Uint8Array): Promise<RitoNativeCallResult>;
  readResource(sessionId: bigint, artifactId: bigint, kind: number, href: string): Promise<RitoNativeCallResult>;
  search(sessionId: bigint, request: Uint8Array): Promise<RitoNativeCallResult>;
  textRangeGeometry(sessionId: bigint, request: Uint8Array): Promise<RitoNativeCallResult>;
  readFootnote(sessionId: bigint, artifactId: bigint, key: string): Promise<RitoNativeCallResult>;
  releaseArtifact(sessionId: bigint, artifactId: bigint): Promise<RitoNativeCallResult>;
  dispose(sessionId: bigint): Promise<RitoNativeCallResult>;
}

export interface RitoNativeCallResult {
  readonly status: RitoNativeStatus;
  readonly data: Uint8Array;
  readonly error: string;
}

export function isRitoNativeReaderAvailable(): boolean {
  return NativeRitoReader !== null;
}

export function getRitoNativeReaderModule(): RitoNativeReaderModule {
  if (!NativeRitoReader) {
    throw new RitoNativeModuleUnavailableError();
  }
  return new RitoNativeReaderModuleImplementation(NativeRitoReader);
}

class RitoNativeReaderModuleImplementation implements RitoNativeReaderModule {
  constructor(private readonly native: Spec) {}

  async open(publication: Uint8Array, request: Uint8Array, fonts: readonly RitoNativePinnedFontFace[]): Promise<RitoNativeCallResult> {
    return this.unwrap(
      'open',
      this.native.open(
        toBase64(publication, 'rito.encode.open.publication'),
        toBase64(request, 'rito.encode.open.request'),
        fonts.map((face, index) => toNativePinnedFontFace(face, index)),
      ),
    );
  }

  async readPublication(sessionId: bigint): Promise<RitoNativeCallResult> {
    return this.unwrap('readPublication', this.native.readPublication(toExternalIdString(sessionId)));
  }

  async requestArtifact(sessionId: bigint, request: Uint8Array): Promise<RitoNativeCallResult> {
    return this.unwrap('requestArtifact', this.native.requestArtifact(toExternalIdString(sessionId), toBase64(request, 'rito.encode.requestArtifact')));
  }

  async requestAdjacent(sessionId: bigint, request: Uint8Array): Promise<RitoNativeCallResult> {
    return this.unwrap('requestAdjacent', this.native.requestAdjacent(toExternalIdString(sessionId), toBase64(request, 'rito.encode.requestAdjacent')));
  }

  async peekAdjacent(sessionId: bigint, request: Uint8Array): Promise<RitoNativeCallResult> {
    return this.unwrap('peekAdjacent', this.native.peekAdjacent(toExternalIdString(sessionId), toBase64(request, 'rito.encode.peekAdjacent')));
  }

  async adoptForeground(sessionId: bigint, request: Uint8Array): Promise<RitoNativeCallResult> {
    return this.unwrap('adoptForeground', this.native.adoptForeground(toExternalIdString(sessionId), toBase64(request, 'rito.encode.adoptForeground')));
  }

  async commitPeekedArtifact(sessionId: bigint, request: Uint8Array): Promise<RitoNativeCallResult> {
    return this.unwrap('commitPeekedArtifact', this.native.commitPeekedArtifact(toExternalIdString(sessionId), toBase64(request, 'rito.encode.commitPeekedArtifact')));
  }

  async advanceBackground(sessionId: bigint, request: Uint8Array): Promise<RitoNativeCallResult> {
    return this.unwrap('advanceBackground', this.native.advanceBackground(toExternalIdString(sessionId), toBase64(request, 'rito.encode.advanceBackground')));
  }

  async adoptBackground(sessionId: bigint, request: Uint8Array): Promise<RitoNativeCallResult> {
    return this.unwrap('adoptBackground', this.native.adoptBackground(toExternalIdString(sessionId), toBase64(request, 'rito.encode.adoptBackground')));
  }

  async readResource(sessionId: bigint, artifactId: bigint, kind: number, href: string): Promise<RitoNativeCallResult> {
    return this.unwrap(
      'readResource',
      this.native.readResource(toExternalIdString(sessionId), toExternalIdString(artifactId), kind, href),
    );
  }

  async search(sessionId: bigint, request: Uint8Array): Promise<RitoNativeCallResult> {
    return this.unwrap('search', this.native.search(toExternalIdString(sessionId), toBase64(request, 'rito.encode.search')));
  }

  async textRangeGeometry(sessionId: bigint, request: Uint8Array): Promise<RitoNativeCallResult> {
    return this.unwrap('textRangeGeometry', this.native.textRangeGeometry(toExternalIdString(sessionId), toBase64(request, 'rito.encode.textRangeGeometry')));
  }

  async readFootnote(sessionId: bigint, artifactId: bigint, key: string): Promise<RitoNativeCallResult> {
    return this.unwrap('readFootnote', this.native.readFootnote(toExternalIdString(sessionId), toExternalIdString(artifactId), key));
  }

  async releaseArtifact(sessionId: bigint, artifactId: bigint): Promise<RitoNativeCallResult> {
    return this.unwrap('releaseArtifact', this.native.releaseArtifact(toExternalIdString(sessionId), toExternalIdString(artifactId)));
  }

  async dispose(sessionId: bigint): Promise<RitoNativeCallResult> {
    return this.unwrap('dispose', this.native.dispose(toExternalIdString(sessionId)));
  }

  private async unwrap(operation: string, result: Promise<NativeBufferResult>): Promise<RitoNativeCallResult> {
    nativePerfMark(`rito.turbomodule.${operation}.start`);
    const response = await result;
    nativePerfMark(`rito.turbomodule.${operation}.end`);
    if (!(response.data instanceof Uint8Array)) {
      throw new RitoNativeError(4, 'NativeRitoReader returned a non-binary response.', operation);
    }
    return {
      status: response.status as RitoNativeStatus,
      data: response.data.slice(),
      error: typeof response.error === 'string' ? response.error : '',
    };
  }
}

function toNativePinnedFontFace(face: RitoNativePinnedFontFace, index: number): NativePinnedFontFace {
  return {
    bytes: toBase64(face.bytes, `rito.encode.open.font.${index}`),
    expectedSha256: face.expectedSha256,
    genericRole: toNativeFontRole(face.genericRole),
    language: face.language,
  };
}

function toNativeFontRole(role: RitoNativePinnedFontFace['genericRole']): number {
  switch (role) {
    case 'serif':
      return 0;
    case 'sansSerif':
      return 1;
    case 'monospace':
      return 2;
  }
}

function toBase64(value: Uint8Array, label?: string): string {
  nativePerfMark(label ? `${label}.start` : 'rito.encode.base64.start');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let index = 0; index < value.byteLength; index += 3) {
    const first = value[index] ?? 0;
    const second = value[index + 1];
    const third = value[index + 2];
    output += alphabet[first >> 2];
    output += alphabet[((first & 3) << 4) | ((second ?? 0) >> 4)];
    output += second === undefined ? '=' : alphabet[((second & 15) << 2) | ((third ?? 0) >> 6)];
    output += third === undefined ? '=' : alphabet[third & 63];
  }
  nativePerfMark(label ? `${label}.end` : 'rito.encode.base64.end');
  return output;
}
