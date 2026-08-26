import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type NativePinnedFontFace = {
  /** Base64-encoded font bytes. Codegen does not preserve typed arrays. */
  readonly bytes: string;
  readonly expectedSha256: string;
  readonly genericRole: number;
  readonly language?: string;
};

export type NativeBufferResult = {
  readonly status: number;
  /** JSI Uint8Array created by the C++ implementation. */
  readonly data: Object;
  readonly error: string;
};

/**
 * Low-level projection of rito-ffi V1.
 *
 * Session and artifact identifiers use decimal strings because Rito's IDs are
 * 64-bit values and a JavaScript number cannot represent the full ABI range.
 */
export interface Spec extends TurboModule {
  open(
    publication: string,
    request: string,
    fonts: readonly NativePinnedFontFace[],
  ): Promise<NativeBufferResult>;
  readPublication(sessionId: string): Promise<NativeBufferResult>;
  requestArtifact(sessionId: string, request: string): Promise<NativeBufferResult>;
  requestAdjacent(sessionId: string, request: string): Promise<NativeBufferResult>;
  peekAdjacent(sessionId: string, request: string): Promise<NativeBufferResult>;
  adoptForeground(sessionId: string, request: string): Promise<NativeBufferResult>;
  commitPeekedArtifact(sessionId: string, request: string): Promise<NativeBufferResult>;
  advanceBackground(sessionId: string, request: string): Promise<NativeBufferResult>;
  adoptBackground(sessionId: string, request: string): Promise<NativeBufferResult>;
  readResource(
    sessionId: string,
    artifactId: string,
    kind: number,
    href: string,
  ): Promise<NativeBufferResult>;
  search(sessionId: string, request: string): Promise<NativeBufferResult>;
  textRangeGeometry(sessionId: string, request: string): Promise<NativeBufferResult>;
  readFootnote(sessionId: string, artifactId: string, key: string): Promise<NativeBufferResult>;
  releaseArtifact(sessionId: string, artifactId: string): Promise<NativeBufferResult>;
  dispose(sessionId: string): Promise<NativeBufferResult>;
}

export default TurboModuleRegistry.get<Spec>('NativeRitoReader');
