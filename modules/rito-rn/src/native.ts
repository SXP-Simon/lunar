import NativeRitoReader, {
  type NativeBufferResult,
  type NativePinnedFontFace,
  type Spec,
} from '../specs/NativeRitoReader';
import { RitoNativeError, RitoNativeModuleUnavailableError, type RitoNativeStatus } from './errors';
import { toExternalIdString } from './protocol/binary';

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
        toUint8Array(publication),
        toUint8Array(request),
        fonts.map(toNativePinnedFontFace),
      ),
    );
  }

  async readPublication(sessionId: bigint): Promise<RitoNativeCallResult> {
    return this.unwrap('readPublication', this.native.readPublication(toExternalIdString(sessionId)));
  }

  async requestArtifact(sessionId: bigint, request: Uint8Array): Promise<RitoNativeCallResult> {
    return this.unwrap('requestArtifact', this.native.requestArtifact(toExternalIdString(sessionId), toUint8Array(request)));
  }

  async requestAdjacent(sessionId: bigint, request: Uint8Array): Promise<RitoNativeCallResult> {
    return this.unwrap('requestAdjacent', this.native.requestAdjacent(toExternalIdString(sessionId), toUint8Array(request)));
  }

  async peekAdjacent(sessionId: bigint, request: Uint8Array): Promise<RitoNativeCallResult> {
    return this.unwrap('peekAdjacent', this.native.peekAdjacent(toExternalIdString(sessionId), toUint8Array(request)));
  }

  async adoptForeground(sessionId: bigint, request: Uint8Array): Promise<RitoNativeCallResult> {
    return this.unwrap('adoptForeground', this.native.adoptForeground(toExternalIdString(sessionId), toUint8Array(request)));
  }

  async commitPeekedArtifact(sessionId: bigint, request: Uint8Array): Promise<RitoNativeCallResult> {
    return this.unwrap('commitPeekedArtifact', this.native.commitPeekedArtifact(toExternalIdString(sessionId), toUint8Array(request)));
  }

  async advanceBackground(sessionId: bigint, request: Uint8Array): Promise<RitoNativeCallResult> {
    return this.unwrap('advanceBackground', this.native.advanceBackground(toExternalIdString(sessionId), toUint8Array(request)));
  }

  async adoptBackground(sessionId: bigint, request: Uint8Array): Promise<RitoNativeCallResult> {
    return this.unwrap('adoptBackground', this.native.adoptBackground(toExternalIdString(sessionId), toUint8Array(request)));
  }

  async readResource(sessionId: bigint, artifactId: bigint, kind: number, href: string): Promise<RitoNativeCallResult> {
    return this.unwrap(
      'readResource',
      this.native.readResource(toExternalIdString(sessionId), toExternalIdString(artifactId), kind, href),
    );
  }

  async search(sessionId: bigint, request: Uint8Array): Promise<RitoNativeCallResult> {
    return this.unwrap('search', this.native.search(toExternalIdString(sessionId), toUint8Array(request)));
  }

  async textRangeGeometry(sessionId: bigint, request: Uint8Array): Promise<RitoNativeCallResult> {
    return this.unwrap('textRangeGeometry', this.native.textRangeGeometry(toExternalIdString(sessionId), toUint8Array(request)));
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
    const response = await result;
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

function toNativePinnedFontFace(face: RitoNativePinnedFontFace): NativePinnedFontFace {
  return {
    bytes: face.bytes,
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

function toUint8Array(value: Uint8Array): Uint8Array {
  // Preserve the typed-array view and its byte range. The C++ bridge also
  // accepts ArrayBuffer values for callers that cannot retain this view.
  return value;
}
