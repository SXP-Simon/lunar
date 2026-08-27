import type {
  RitoNitro as RitoNitroSpec,
  RitoNitroPinnedFontFace,
  RitoNitroResult,
} from './specs/rito-nitro.nitro';
import { RitoNativeError, RitoNativeModuleUnavailableError, type RitoNativeStatus } from './errors';
import { toExternalIdString } from './protocol/binary';

const perfConsole = console as Console & { timeStamp?: (label?: string) => void };
function nativePerfMark(label: string): void {
  if (process.env.EXPO_PUBLIC_READER_PERF === '1') perfConsole.timeStamp?.(`[LunarReader] ${label}`);
}

export type RitoNativePinnedFontFace = {
  readonly bytes: Uint8Array;
  readonly expectedSha256: string;
  readonly genericRole: 'serif' | 'sansSerif' | 'monospace';
  readonly language?: string;
};

export interface RitoNativeReaderModule {
  open(publication: Uint8Array, request: Uint8Array, fonts: readonly RitoNativePinnedFontFace[]): Promise<RitoNativeCallResult>;
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

let nativeObject: RitoNitroSpec | null | undefined;
function getNitroObject(): RitoNitroSpec | null {
  if (nativeObject !== undefined) return nativeObject;
  try {
    const nitroModules = loadNitroModules();
    nativeObject = nitroModules?.createHybridObject<RitoNitroSpec>('RitoNitro') ?? null;
  } catch {
    nativeObject = null;
  }
  return nativeObject;
}

function loadNitroModules(): { createHybridObject<T>(name: string): T } | null {
  try {
    const runtimeRequire = (0, eval)('require') as ((name: string) => { NitroModules?: { createHybridObject<T>(name: string): T } }) | undefined;
    return runtimeRequire?.('react-native-nitro-modules')?.NitroModules ?? null;
  } catch {
    return null;
  }
}

export function isRitoNativeReaderAvailable(): boolean {
  return getNitroObject() !== null;
}

export function getRitoNativeReaderModule(): RitoNativeReaderModule {
  const native = getNitroObject();
  if (!native) throw new RitoNativeModuleUnavailableError();
  return new RitoNitroReaderModule(native);
}

class RitoNitroReaderModule implements RitoNativeReaderModule {
  constructor(private readonly native: RitoNitroSpec) {}

  open(publication: Uint8Array, request: Uint8Array, fonts: readonly RitoNativePinnedFontFace[]): Promise<RitoNativeCallResult> {
    return this.unwrap('open', this.native.open(toArrayBuffer(publication), toArrayBuffer(request), fonts.map(toNitroFont)));
  }
  readPublication(sessionId: bigint) { return this.unwrap('readPublication', this.native.readPublication(toExternalIdString(sessionId))); }
  requestArtifact(sessionId: bigint, request: Uint8Array) { return this.unwrap('requestArtifact', this.native.requestArtifact(toExternalIdString(sessionId), toArrayBuffer(request))); }
  requestAdjacent(sessionId: bigint, request: Uint8Array) { return this.unwrap('requestAdjacent', this.native.requestAdjacent(toExternalIdString(sessionId), toArrayBuffer(request))); }
  peekAdjacent(sessionId: bigint, request: Uint8Array) { return this.unwrap('peekAdjacent', this.native.peekAdjacent(toExternalIdString(sessionId), toArrayBuffer(request))); }
  adoptForeground(sessionId: bigint, request: Uint8Array) { return this.unwrap('adoptForeground', this.native.adoptForeground(toExternalIdString(sessionId), toArrayBuffer(request))); }
  commitPeekedArtifact(sessionId: bigint, request: Uint8Array) { return this.unwrap('commitPeekedArtifact', this.native.commitPeekedArtifact(toExternalIdString(sessionId), toArrayBuffer(request))); }
  advanceBackground(sessionId: bigint, request: Uint8Array) { return this.unwrap('advanceBackground', this.native.advanceBackground(toExternalIdString(sessionId), toArrayBuffer(request))); }
  adoptBackground(sessionId: bigint, request: Uint8Array) { return this.unwrap('adoptBackground', this.native.adoptBackground(toExternalIdString(sessionId), toArrayBuffer(request))); }
  readResource(sessionId: bigint, artifactId: bigint, kind: number, href: string) { return this.unwrap('readResource', this.native.readResource(toExternalIdString(sessionId), toExternalIdString(artifactId), kind, href)); }
  search(sessionId: bigint, request: Uint8Array) { return this.unwrap('search', this.native.search(toExternalIdString(sessionId), toArrayBuffer(request))); }
  textRangeGeometry(sessionId: bigint, request: Uint8Array) { return this.unwrap('textRangeGeometry', this.native.textRangeGeometry(toExternalIdString(sessionId), toArrayBuffer(request))); }
  readFootnote(sessionId: bigint, artifactId: bigint, key: string) { return this.unwrap('readFootnote', this.native.readFootnote(toExternalIdString(sessionId), toExternalIdString(artifactId), key)); }
  releaseArtifact(sessionId: bigint, artifactId: bigint) { return this.unwrap('releaseArtifact', this.native.releaseArtifact(toExternalIdString(sessionId), toExternalIdString(artifactId))); }
  dispose(sessionId: bigint) { return this.unwrap('dispose', this.native.disposeSession(toExternalIdString(sessionId))); }

  private async unwrap(operation: string, result: Promise<RitoNitroResult>): Promise<RitoNativeCallResult> {
    nativePerfMark(`rito.nitro.${operation}.start`);
    const response = await result;
    nativePerfMark(`rito.nitro.${operation}.end`);
    if (!(response.data instanceof ArrayBuffer)) throw new RitoNativeError(4, 'Rito Nitro returned a non-binary response.', operation);
    return { status: response.status as RitoNativeStatus, data: new Uint8Array(response.data.slice(0)), error: response.error || '' };
  }
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  if (value.byteOffset === 0 && value.byteLength === value.buffer.byteLength && value.buffer instanceof ArrayBuffer) return value.buffer;
  return value.slice().buffer;
}
function toNitroFont(face: RitoNativePinnedFontFace): RitoNitroPinnedFontFace {
  return { bytes: toArrayBuffer(face.bytes), expectedSha256: face.expectedSha256, genericRole: face.genericRole === 'serif' ? 0 : face.genericRole === 'sansSerif' ? 1 : 2, language: face.language };
}
