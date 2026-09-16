import { RitoWireError } from '../errors';
import { RitoBinaryReader } from './binary';
import { decodeRitoReaderPrimitiveList } from './rito2/reader-session-primitive-decoder-runtime.js';
import type {
  RitoAdjacentAvailability, RitoArtifact, RitoDisplayListPayload, RitoFontRef, RitoHitEntry,
  RitoLocatorMatch, RitoNavigation, RitoPage, RitoRect, RitoResourceKind, RitoResourceRef,
  RitoSemanticNode, RitoSemanticRole, RitoTextProfile, RitoTextRunOffset,
} from './artifact-types';
import { readRitoLocator, readRitoSourcePoint } from './locator';

const MAX_WIRE_BYTES = 256 * 1024 * 1024;

export function decodeRitoArtifact(data: Uint8Array): RitoArtifact {
  const reader = openMessage(data, 'RITOART1', MAX_WIRE_BYTES, 'artifact');
  const protocolVersion = reader.readU32();
  if (protocolVersion !== 5) throw new RitoWireError(`Unsupported artifact protocol version: ${protocolVersion}.`);
  const capabilityProfileId = reader.readU32();
  if (capabilityProfileId !== 1) throw new RitoWireError(`Unsupported capability profile: ${capabilityProfileId}.`);
  const result: RitoArtifact = {
    protocolVersion,
    capabilityProfileId,
    sessionId: reader.readExternalId('session id'),
    requestId: reader.readExternalId('request id'),
    revisionId: reader.readExternalId('revision id'),
    revisionVersion: reader.readU32(),
    artifactId: reader.readExternalId('artifact id'),
    locator: readRitoLocator(reader),
    matchedBy: readEnum(reader, ['source-range', 'source-point', 'anchor', 'progression', 'href'] as const, 'locator match'),
    localPageIndex: reader.readU32(),
    localSpreadIndex: reader.readU32(),
    localPageIndexes: readU32Collection(reader, 'local page indexes'),
    width: reader.readF64(),
    height: reader.readF64(),
    bookPageIndex: reader.readOption('book page index', () => reader.readU32()),
    bookPageCount: reader.readOption('book page count', () => reader.readU32()),
    navigation: { previous: readAvailability(reader), next: readAvailability(reader) },
    textProfile: readEnum(reader, ['platform-string-runs', 'positioned-glyph-runs'] as const, 'text profile'),
    displayList: readDisplayListPayload(reader),
    resources: readCollection(reader, 'resources', () => reader.readRecord('resource', readResourceRef)),
    fonts: readCollection(reader, 'fonts', () => reader.readRecord('font', readFontRef)),
    pages: readCollection(reader, 'pages', () => reader.readRecord('page', readPage)),
  };
  reader.expectExhausted();
  return result;
}

export function decodeRitoResource(data: Uint8Array): import('./artifact-types').RitoResource {
  const reader = openMessage(data, 'RITORES1', MAX_WIRE_BYTES, 'resource');
  const artifactId = reader.readExternalId('resource artifact id');
  const kind = readEnum(reader, ['image', 'font', 'stylesheet'] as const, 'resource kind');
  const href = reader.readUtf8();
  const mediaType = reader.readUtf8();
  const bytes = reader.readBlob('resource bytes', kind === 'image' ? 32 * 1024 * 1024 : kind === 'font' ? 16 * 1024 * 1024 : 4 * 1024 * 1024);
  const width = reader.readOption('resource width', () => reader.readU32());
  const height = reader.readOption('resource height', () => reader.readU32());
  reader.expectExhausted();
  return { artifactId, kind, href, mediaType, bytes, width, height };
}

function openMessage(data: Uint8Array, magic: string, max: number, label: string): RitoBinaryReader {
  if (data.byteLength > max) throw new RitoWireError(`${label} wire message exceeds the byte limit.`);
  const reader = new RitoBinaryReader(data);
  reader.expectHeader(magic);
  if (reader.readU32() !== 1) throw new RitoWireError(`Unsupported ${magic} wire version.`);
  const declared = reader.readU64();
  if (declared !== BigInt(data.byteLength)) throw new RitoWireError(`${label} total length does not match input.`);
  return reader;
}

function readDisplayListPayload(reader: RitoBinaryReader): RitoDisplayListPayload {
  return reader.readRecord('display list', (record) => {
    const formatVersion = record.readU32();
    if (formatVersion !== 2) throw new RitoWireError(`Unsupported RITODL1 format version: ${formatVersion}.`);
    const commandCount = record.readU32();
    const semanticDigest = record.readFixedBytes(32, 'display list digest');
    const wireBytes = record.readBlob('display list bytes');
    const displayList = decodeRitoReaderPrimitiveList(wireBytes);
    if (displayList.formatVersion !== formatVersion || displayList.commands.length !== commandCount) {
      throw new RitoWireError('Display list metadata does not match RITODL1 bytes.');
    }
    return { formatVersion: displayList.formatVersion, commandCount, semanticDigest, wireBytes, displayList };
  });
}

function readResourceRef(reader: RitoBinaryReader): RitoResourceRef {
  return { kind: readEnum(reader, ['image', 'font', 'stylesheet'] as const, 'resource kind'), href: reader.readUtf8() };
}

function readFontRef(reader: RitoBinaryReader): RitoFontRef {
  return { family: reader.readUtf8(), href: reader.readUtf8(), style: reader.readUtf8(), weight: reader.readU16(), shapeFingerprint: reader.readUtf8(), byteLength: reader.readU64() };
}

function readPage(reader: RitoBinaryReader): RitoPage {
  return {
    pageIndex: reader.readU32(), width: reader.readF64(), height: reader.readF64(),
    hits: readCollection(reader, 'page hits', () => reader.readRecord('hit', readHit)),
    semantics: readCollection(reader, 'page semantics', () => reader.readRecord('semantic node', (record) => readSemantic(record, 0))),
    text: reader.readUtf8(), textLength: reader.readU64(),
    textRuns: readCollection(reader, 'page text runs', () => reader.readRecord('text run', (record): RitoTextRunOffset => ({ start: record.readU64(), end: record.readU64(), blockIndex: record.readU32(), lineIndex: record.readU32(), runIndex: record.readU32() }))),
  };
}

function readHit(reader: RitoBinaryReader): RitoHitEntry {
  return { pageIndex: reader.readU32(), bounds: readRect(reader), text: reader.readUtf8(), href: reader.readOption('hit href', () => reader.readUtf8()), sourcePoint: reader.readOption('hit source point', () => readRitoSourcePoint(reader)), imageSrc: reader.readOption('hit image source', () => reader.readUtf8()), imageAlt: reader.readOption('hit image alternative', () => reader.readUtf8()), footnoteKey: reader.readOption('hit footnote key', () => reader.readUtf8()), footnotePending: reader.readBoolean('hit footnote pending') };
}

function readSemantic(reader: RitoBinaryReader, depth: number): RitoSemanticNode {
  if (depth > 64) throw new RitoWireError('Semantic tree exceeds the depth limit.');
  return { role: readEnum(reader, ['heading', 'paragraph', 'list', 'list-item', 'image', 'link', 'blockquote', 'table', 'generic'] as const, 'semantic role'), level: reader.readOption('semantic level', () => reader.readU8()), text: reader.readOption('semantic text', () => reader.readUtf8()), alt: reader.readOption('semantic alternative', () => reader.readUtf8()), href: reader.readOption('semantic href', () => reader.readUtf8()), bounds: readRect(reader), children: readCollection(reader, 'semantic children', () => reader.readRecord('semantic node', (record) => readSemantic(record, depth + 1))) };
}

function readRect(reader: RitoBinaryReader): RitoRect { return { x: reader.readF64(), y: reader.readF64(), width: reader.readF64(), height: reader.readF64() }; }
function readAvailability(reader: RitoBinaryReader): RitoAdjacentAvailability { return readEnum(reader, ['available', 'chapter-boundary', 'terminal'] as const, 'adjacent availability'); }
function readU32Collection(reader: RitoBinaryReader, field: string): readonly number[] { return readCollection(reader, field, () => reader.readU32()); }
function readCollection<T>(reader: RitoBinaryReader, field: string, read: () => T): readonly T[] { return Array.from({ length: reader.readCount(field) }, read); }
function readEnum<T extends readonly string[]>(reader: RitoBinaryReader, values: T, field: string): T[number] { const tag = reader.readU32(); const value = values[tag]; if (!value) throw new RitoWireError(`Unknown ${field}: ${tag}.`); return value; }
