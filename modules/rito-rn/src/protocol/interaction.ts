import { RitoWireError } from '../errors';
import { RitoBinaryReader, RitoBinaryWriter } from './binary';
import type { RitoLocator, RitoRect } from './artifact-types';
import { readRitoLocator } from './locator';

export interface RitoTextPosition { readonly blockIndex: number; readonly lineIndex: number; readonly runIndex: number; readonly charIndex: number }
export interface RitoSearchRequest { readonly sessionId: bigint; readonly artifactId: bigint; readonly query: string; readonly caseSensitive?: boolean; readonly wholeWord?: boolean; readonly limit?: number }
export interface RitoSearchResult { readonly pageIndex: number; readonly spreadIndex: number; readonly start: RitoTextPosition; readonly end: RitoTextPosition; readonly context: string; readonly locator?: RitoLocator }
export interface RitoSearchResponse { readonly artifactId: bigint; readonly query: string; readonly truncated: boolean; readonly searchedPageCount: number; readonly results: readonly RitoSearchResult[] }
export interface RitoTextRangeRequest { readonly sessionId: bigint; readonly artifactId: bigint; readonly pageIndex: number; readonly start: RitoTextPosition; readonly end: RitoTextPosition }
export interface RitoTextRect { readonly bounds: RitoRect; readonly blockIndex: number; readonly lineIndex: number; readonly runIndex: number; readonly startCharIndex: number; readonly endCharIndex: number }
export interface RitoTextRangeGeometry { readonly artifactId: bigint; readonly pageIndex: number; readonly rects: readonly RitoTextRect[] }
export type RitoFootnoteKind = 'footnote' | 'endnote' | 'rearnote' | 'note';
export interface RitoFootnote { readonly artifactId: bigint; readonly key: string; readonly kind: RitoFootnoteKind; readonly text: string; readonly html: string }

export function encodeRitoSearchRequest(request: RitoSearchRequest): Uint8Array {
  const writer = message('RITOSRQ1').writeU64(request.sessionId).writeU64(request.artifactId).writeUtf8(request.query).writeU8(request.caseSensitive ? 1 : 0).writeU8(request.wholeWord ? 1 : 0).writeU32(request.limit ?? 0);
  return finish(writer);
}

export function encodeRitoTextRangeRequest(request: RitoTextRangeRequest): Uint8Array {
  const writer = message('RITOTRQ1').writeU64(request.sessionId).writeU64(request.artifactId).writeU32(request.pageIndex);
  writePosition(writer, request.start); writePosition(writer, request.end);
  const bytes = finish(writer);
  if (bytes.byteLength !== 72) throw new RitoWireError('RITOTRQ1 must be exactly 72 bytes.');
  return bytes;
}

export function decodeRitoSearchResponse(data: Uint8Array): RitoSearchResponse {
  const reader = open(data, 'RITOSRS1');
  const result = { artifactId: reader.readExternalId('search artifact id'), query: reader.readUtf8(), truncated: reader.readBoolean('search truncated'), searchedPageCount: reader.readU32(), results: Array.from({ length: reader.readCount('search results') }, () => reader.readRecord('search result', readSearchResult)) };
  reader.expectExhausted(); return result;
}

export function decodeRitoTextRangeGeometry(data: Uint8Array): RitoTextRangeGeometry {
  const reader = open(data, 'RITOTRG1');
  const result = { artifactId: reader.readExternalId('text geometry artifact id'), pageIndex: reader.readU32(), rects: Array.from({ length: reader.readCount('text range rects') }, () => reader.readRecord('text range rect', readTextRect)) };
  reader.expectExhausted(); return result;
}

export function decodeRitoFootnote(data: Uint8Array): RitoFootnote {
  const reader = open(data, 'RITOFTN1');
  const artifactId = reader.readExternalId('footnote artifact id');
  const key = reader.readUtf8();
  const kind = reader.readU32();
  const kinds = ['footnote', 'endnote', 'rearnote', 'note'] as const;
  if (!kinds[kind]) throw new RitoWireError(`Unknown footnote kind: ${kind}.`);
  const result = { artifactId, key, kind: kinds[kind]!, text: reader.readUtf8(), html: reader.readUtf8() };
  reader.expectExhausted(); return result;
}

function readSearchResult(reader: RitoBinaryReader): RitoSearchResult { return { pageIndex: reader.readU32(), spreadIndex: reader.readU32(), start: readPosition(reader), end: readPosition(reader), context: reader.readUtf8(), locator: reader.readOption('search locator', () => readRitoLocator(reader, 'search locator')) }; }
function readPosition(reader: RitoBinaryReader): RitoTextPosition { return { blockIndex: reader.readU32(), lineIndex: reader.readU32(), runIndex: reader.readU32(), charIndex: reader.readU32() }; }
function writePosition(writer: RitoBinaryWriter, value: RitoTextPosition): void { writer.writeU32(value.blockIndex).writeU32(value.lineIndex).writeU32(value.runIndex).writeU32(value.charIndex); }
function readTextRect(reader: RitoBinaryReader): RitoTextRect { return { bounds: { x: reader.readF64(), y: reader.readF64(), width: reader.readF64(), height: reader.readF64() }, blockIndex: reader.readU32(), lineIndex: reader.readU32(), runIndex: reader.readU32(), startCharIndex: reader.readU32(), endCharIndex: reader.readU32() }; }
function message(magic: string): RitoBinaryWriter { return new RitoBinaryWriter().writeAscii(magic).writeU32(1).writeU64(0n); }
function finish(writer: RitoBinaryWriter): Uint8Array { const bytes = writer.toUint8Array(); new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setBigUint64(12, BigInt(bytes.byteLength), true); return bytes; }
function open(data: Uint8Array, magic: string): RitoBinaryReader { const reader = new RitoBinaryReader(data); reader.expectHeader(magic); if (reader.readU32() !== 1) throw new RitoWireError(`Unsupported ${magic} wire version.`); if (reader.readU64() !== BigInt(data.byteLength)) throw new RitoWireError(`${magic} total length does not match input.`); return reader; }
