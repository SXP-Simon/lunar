import { RitoWireError } from '../errors';
import { RitoBinaryReader } from './binary';
import type { RitoLocator, RitoPublication, RitoPublicationMetadata, RitoPublicationSpineItem, RitoSourcePoint, RitoTocEntry } from './artifact-types';

const MAX_BYTES = 16 * 1024 * 1024;
const MAX_DEPTH = 64;
const MAX_ITEMS = 100_000;

export function decodeRitoPublication(data: Uint8Array): RitoPublication {
  if (data.byteLength > MAX_BYTES) throw new RitoWireError('RITOPUB1 exceeds the byte limit.');
  const reader = new RitoBinaryReader(data);
  reader.expectHeader('RITOPUB1');
  if (reader.readU32() !== 1) throw new RitoWireError('Unsupported RITOPUB1 wire version.');
  if (reader.readU64() !== BigInt(data.byteLength)) throw new RitoWireError('Publication total length does not match input.');
  const protocolVersion = reader.readU32();
  if (protocolVersion !== 5) throw new RitoWireError(`Unsupported publication protocol version: ${protocolVersion}.`);
  const sessionId = reader.readExternalId('publication session id');
  const metadata = reader.readRecord('publication metadata', readMetadata);
  const spine = Array.from({ length: reader.readCount('publication spine') }, () => reader.readRecord('publication spine item', readSpineItem));
  const hrefs = new Set<string>();
  const duplicates = new Set<string>();
  let nextLinear = 0;
  spine.forEach((item, index) => {
    if (item.spineIndex !== index || !item.idref || !item.href) throw new RitoWireError('Publication spine indexes and fields are invalid.');
    if (!hrefs.add(item.href)) duplicates.add(item.href);
    if (item.linearIndex !== undefined && item.linearIndex !== nextLinear++) throw new RitoWireError('Publication linear indexes must be dense and ordered.');
  });
  const state = { nextId: 0, itemCount: 0 };
  const toc = readTocList(reader, 1, spine, duplicates, state);
  reader.expectExhausted();
  return { protocolVersion, sessionId, metadata, spine, toc };
}

function readMetadata(reader: RitoBinaryReader): RitoPublicationMetadata { return { title: reader.readUtf8(), language: reader.readUtf8(), identifier: reader.readUtf8(), creator: reader.readOption('publication creator', () => reader.readUtf8()) }; }
function readSpineItem(reader: RitoBinaryReader): RitoPublicationSpineItem { return { spineIndex: reader.readU32(), linearIndex: reader.readOption('publication linear index', () => reader.readU32()), idref: reader.readUtf8(), href: reader.readUtf8() }; }

function readTocList(reader: RitoBinaryReader, depth: number, spine: readonly RitoPublicationSpineItem[], duplicates: ReadonlySet<string>, state: { nextId: number; itemCount: number }): readonly RitoTocEntry[] {
  const count = reader.readCount('publication TOC child count');
  if (depth > MAX_DEPTH && count > 0) throw new RitoWireError('Publication TOC exceeds the depth limit.');
  state.itemCount += count;
  if (state.itemCount > MAX_ITEMS) throw new RitoWireError('Publication TOC exceeds the item limit.');
  return Array.from({ length: count }, () => reader.readRecord('publication TOC entry', (record) => {
    const id = record.readU32();
    if (id !== state.nextId++) throw new RitoWireError('Publication TOC IDs must be dense preorder identities.');
    const label = record.readUtf8();
    const tag = record.readU8();
    let target: RitoTocEntry['target'];
    if (tag === 0) {
      const spineIndex = record.readU32();
      if (spineIndex >= spine.length) throw new RitoWireError('Publication TOC spine index is out of bounds.');
      const locator = readLocator(record);
      const item = spine[spineIndex]!;
      if (locator.href !== item.href || duplicates.has(locator.href) || locator.sourcePoint || locator.sourceRange || locator.progression !== undefined) throw new RitoWireError('Publication TOC locator is invalid.');
      target = { kind: 'locator', locator };
    } else if (tag === 1) {
      const href = record.readUtf8();
      if (!isExternalHref(href)) throw new RitoWireError('Publication external TOC href is invalid.');
      target = { kind: 'external', href };
    } else if (tag === 2) {
      const href = record.readUtf8();
      if (isExternalHref(href)) throw new RitoWireError('Publication unresolved TOC href must be internal.');
      target = { kind: 'missing', href };
    } else throw new RitoWireError(`Unknown publication TOC target tag: ${tag}.`);
    return { id, label, target, children: readTocList(record, depth + 1, spine, duplicates, state) };
  }));
}

function readLocator(reader: RitoBinaryReader): RitoLocator {
  return reader.readRecord('locator', (record) => ({ href: record.readUtf8(), anchorId: record.readOption('locator anchor', () => record.readUtf8()), sourcePoint: record.readOption('source point', () => readSourcePoint(record)), sourceRange: record.readOption('source range', () => ({ start: readSourcePoint(record), end: readSourcePoint(record) })), progression: record.readOption('locator progression', () => record.readF64()) }));
}
function readSourcePoint(reader: RitoBinaryReader): RitoSourcePoint { return reader.readRecord('source point', (record) => ({ nodePath: Array.from({ length: record.readCount('source point path') }, () => record.readU32()), textOffset: record.readU64() })); }
function isExternalHref(href: string): boolean { if (href.startsWith('//')) return true; const end = Math.min(...[href.indexOf('?'), href.indexOf('#')].filter((value) => value >= 0), href.length); const path = href.slice(0, end); const colon = path.indexOf(':'); if (colon <= 0) return false; return /^[A-Za-z][A-Za-z0-9+.-]*$/.test(path.slice(0, colon)); }
