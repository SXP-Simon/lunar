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
  ): Promise<Uint8Array>;
  readPublication(sessionId: bigint): Promise<Uint8Array>;
  requestArtifact(sessionId: bigint, request: Uint8Array): Promise<Uint8Array>;
  requestAdjacent(sessionId: bigint, request: Uint8Array): Promise<Uint8Array>;
  adoptForeground(sessionId: bigint, request: Uint8Array): Promise<Uint8Array>;
  advanceBackground(sessionId: bigint, request: Uint8Array): Promise<Uint8Array>;
  adoptBackground(sessionId: bigint, request: Uint8Array): Promise<Uint8Array>;
  readResource(sessionId: bigint, artifactId: bigint, kind: number, href: string): Promise<Uint8Array>;
  releaseArtifact(sessionId: bigint, artifactId: bigint): Promise<void>;
  dispose(sessionId: bigint): Promise<void>;
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

  async open(publication: Uint8Array, request: Uint8Array, fonts: readonly RitoNativePinnedFontFace[]): Promise<Uint8Array> {
    return this.unwrap(
      'open',
      this.native.open(
        toArrayBuffer(publication),
        toArrayBuffer(request),
        fonts.map(toNativePinnedFontFace),
      ),
    );
  }

  async readPublication(sessionId: bigint): Promise<Uint8Array> {
    return this.unwrap('readPublication', this.native.readPublication(toExternalIdString(sessionId)));
  }

  async requestArtifact(sessionId: bigint, request: Uint8Array): Promise<Uint8Array> {
    return this.unwrap('requestArtifact', this.native.requestArtifact(toExternalIdString(sessionId), toArrayBuffer(request)));
  }

  async requestAdjacent(sessionId: bigint, request: Uint8Array): Promise<Uint8Array> {
    return this.unwrap('requestAdjacent', this.native.requestAdjacent(toExternalIdString(sessionId), toArrayBuffer(request)));
  }

  async adoptForeground(sessionId: bigint, request: Uint8Array): Promise<Uint8Array> {
    return this.unwrap('adoptForeground', this.native.adoptForeground(toExternalIdString(sessionId), toArrayBuffer(request)));
  }

  async advanceBackground(sessionId: bigint, request: Uint8Array): Promise<Uint8Array> {
    return this.unwrap('advanceBackground', this.native.advanceBackground(toExternalIdString(sessionId), toArrayBuffer(request)));
  }

  async adoptBackground(sessionId: bigint, request: Uint8Array): Promise<Uint8Array> {
    return this.unwrap('adoptBackground', this.native.adoptBackground(toExternalIdString(sessionId), toArrayBuffer(request)));
  }

  async readResource(sessionId: bigint, artifactId: bigint, kind: number, href: string): Promise<Uint8Array> {
    return this.unwrap(
      'readResource',
      this.native.readResource(toExternalIdString(sessionId), toExternalIdString(artifactId), kind, href),
    );
  }

  async releaseArtifact(sessionId: bigint, artifactId: bigint): Promise<void> {
    await this.unwrap('releaseArtifact', this.native.releaseArtifact(toExternalIdString(sessionId), toExternalIdString(artifactId)));
  }

  async dispose(sessionId: bigint): Promise<void> {
    await this.unwrap('dispose', this.native.dispose(toExternalIdString(sessionId)));
  }

  private async unwrap(operation: string, result: Promise<NativeBufferResult>): Promise<Uint8Array> {
    const response = await result;
    if (response.status !== 0) {
      throw new RitoNativeError(
        response.status as RitoNativeStatus,
        response.error || 'Rito native call failed without a diagnostic.',
        operation,
      );
    }
    if (!(response.data instanceof Uint8Array)) {
      throw new RitoNativeError(4, 'NativeRitoReader returned a non-binary response.', operation);
    }
    return response.data.slice();
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

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}
