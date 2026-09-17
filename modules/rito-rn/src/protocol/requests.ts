import { RitoWireError } from '../errors';
import { RitoBinaryWriter } from './binary';

export interface RitoLayoutRequest {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly marginTop: number;
  readonly marginRight: number;
  readonly marginBottom: number;
  readonly marginLeft: number;
  readonly spreadMode: 'single' | 'double';
  readonly firstPageAlone: boolean;
  readonly spreadGap: number;
  readonly rootFontSize: number;
  readonly lineHeightOverride?: number;
  readonly fontFamilyOverride?: string;
  readonly renderRatio?: number;
}

export interface RitoLocator {
  readonly href: string;
  readonly anchorId?: string;
  readonly sourcePoint?: { readonly nodePath: readonly number[]; readonly textOffset: bigint };
  readonly sourceRange?: {
    readonly start: { readonly nodePath: readonly number[]; readonly textOffset: bigint };
    readonly end: { readonly nodePath: readonly number[]; readonly textOffset: bigint };
  };
  readonly progression?: number;
}

export interface RitoArtifactRequest {
  readonly sessionId: bigint;
  readonly requestId: bigint;
  readonly layout: RitoLayoutRequest;
  readonly locator: RitoLocator;
  readonly textProfile?: 'platform-string-runs' | 'positioned-glyph-runs';
}

export interface RitoAdjacentRequest {
  readonly sessionId: bigint;
  readonly requestId: bigint;
  readonly fromArtifactId: bigint;
  readonly direction: 'previous' | 'next';
}

export function encodeRitoArtifactRequest(request: RitoArtifactRequest): Uint8Array {
  const writer = createMessage('RITOREQ1');
  writer.writeU64(request.sessionId).writeU64(request.requestId);
  writer.writeRecord((layout) => writeLayout(layout, request.layout));
  writer.writeRecord((locator) => writeLocator(locator, request.locator));
  writer.writeU32(request.textProfile === 'positioned-glyph-runs' ? 1 : 0);
  return finishMessage(writer);
}

export function encodeRitoAdjacentRequest(request: RitoAdjacentRequest): Uint8Array {
  const writer = createMessage('RITONAV1');
  writer
    .writeU64(request.sessionId)
    .writeU64(request.requestId)
    .writeU64(request.fromArtifactId)
    .writeU32(request.direction === 'previous' ? 0 : 1);
  const bytes = finishMessage(writer);
  if (bytes.byteLength !== 48) {
    throw new RitoWireError('RITONAV1 must be exactly 48 bytes.');
  }
  return bytes;
}

export interface RitoForegroundHandoff {
  readonly sessionId: bigint;
  readonly expectedVisibleArtifactId?: bigint;
  readonly candidateArtifactId: bigint;
}

export interface RitoBackgroundRequest {
  readonly sessionId: bigint;
  readonly expectedVisibleArtifactId: bigint;
}

export interface RitoBackgroundHandoff {
  readonly sessionId: bigint;
  readonly expectedVisibleArtifactId: bigint;
  readonly candidateArtifactId: bigint;
}

export function encodeRitoForegroundHandoff(request: RitoForegroundHandoff): Uint8Array {
  return finishFixedMessage(new RitoBinaryWriter().writeAscii('RITOFGH1').writeU32(1).writeU64(0n)
    .writeU64(request.sessionId).writeU32(request.expectedVisibleArtifactId === undefined ? 0 : 1)
    .writeU64(request.expectedVisibleArtifactId ?? 0n).writeU64(request.candidateArtifactId), 48);
}

export function encodeRitoBackgroundRequest(request: RitoBackgroundRequest): Uint8Array {
  // Rito 2.0.0 retains a non-zero u32 work-budget field in its 40-byte
  // RITOBGQ1 message, but only validates it: publication layout runs in
  // one call. Keep this wire requirement out of the host scheduling API.
  return finishFixedMessage(new RitoBinaryWriter().writeAscii('RITOBGQ1').writeU32(1).writeU64(0n)
    .writeU64(request.sessionId).writeU64(request.expectedVisibleArtifactId).writeU32(1), 40);
}

export function encodeRitoBackgroundHandoff(request: RitoBackgroundHandoff): Uint8Array {
  return finishFixedMessage(new RitoBinaryWriter().writeAscii('RITOHOF1').writeU32(1).writeU64(0n)
    .writeU64(request.sessionId).writeU64(request.expectedVisibleArtifactId).writeU64(request.candidateArtifactId), 44);
}

function createMessage(magic: string): RitoBinaryWriter {
  return new RitoBinaryWriter().writeAscii(magic).writeU32(1).writeU64(0n);
}

function finishMessage(writer: RitoBinaryWriter): Uint8Array {
  const bytes = writer.toUint8Array();
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setBigUint64(12, BigInt(bytes.byteLength), true);
  return bytes;
}

function finishFixedMessage(writer: RitoBinaryWriter, expected: number): Uint8Array {
  const bytes = finishMessage(writer);
  if (bytes.byteLength !== expected) throw new RitoWireError(`Rito fixed message must be exactly ${expected} bytes.`);
  return bytes;
}

function writeLayout(writer: RitoBinaryWriter, value: RitoLayoutRequest): void {
  writer
    .writeF64(value.viewportWidth)
    .writeF64(value.viewportHeight)
    .writeF64(value.marginTop)
    .writeF64(value.marginRight)
    .writeF64(value.marginBottom)
    .writeF64(value.marginLeft)
    .writeU32(value.spreadMode === 'single' ? 0 : 1)
    .writeU8(value.firstPageAlone ? 1 : 0)
    .writeF64(value.spreadGap)
    .writeF64(value.rootFontSize);
  writeOption(writer, value.lineHeightOverride, (lineHeight) => writer.writeF64(lineHeight));
  writeOption(writer, value.fontFamilyOverride, (family) => writer.writeUtf8(family));
  writer.writeF64(value.renderRatio ?? 1);
}

function writeLocator(writer: RitoBinaryWriter, value: RitoLocator): void {
  if (!value.href) {
    throw new RitoWireError('Rito locator href must not be empty.');
  }
  writer.writeUtf8(value.href);
  writeOption(writer, value.anchorId, (anchor) => writer.writeUtf8(anchor));
  writeOption(writer, value.sourcePoint, (point) => writeSourcePointRecord(writer, point));
  writeOption(writer, value.sourceRange, (range) => writer.writeRecord((record) => {
    writeSourcePointRecord(record, range.start);
    writeSourcePointRecord(record, range.end);
  }));
  writeOption(writer, value.progression, (progression) => writer.writeF64(progression));
}

function writeSourcePointRecord(
  writer: RitoBinaryWriter,
  point: { readonly nodePath: readonly number[]; readonly textOffset: bigint },
): void {
  writer.writeRecord((record) => {
    record.writeU32(point.nodePath.length);
    for (const item of point.nodePath) record.writeU32(item);
    record.writeU64(point.textOffset);
  });
}

function writeOption<T>(writer: RitoBinaryWriter, value: T | undefined, write: (value: T) => void): void {
  if (value === undefined) {
    writer.writeU8(0);
    return;
  }
  writer.writeU8(1);
  write(value);
}
