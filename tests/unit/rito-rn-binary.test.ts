import { describe, expect, it } from 'vitest';

import {
  RitoBinaryReader,
  RitoBinaryWriter,
  toExternalId,
  toExternalIdString,
} from '../../modules/rito-rn/src/protocol/binary';
import { RitoWireError as BinaryRitoWireError } from '../../modules/rito-rn/src/errors';
import { decodeRitoDisplayList, decodeRitoDisplayListWithTypedColors } from '../../modules/rito-rn/src/protocol/display-list';
import { toReaderV1DisplayList } from '../../src/reader/rito/rito-v1-display-list';
import { encodeRitoAdjacentRequest } from '../../modules/rito-rn/src/protocol/requests';
import { encodeRitoBackgroundHandoff, encodeRitoBackgroundRequest, encodeRitoForegroundHandoff } from '../../modules/rito-rn/src/protocol/requests';
import { decodeRitoBackgroundHandoffAck, decodeRitoForegroundHandoffAck } from '../../modules/rito-rn/src/protocol/handoff';
import { decodeRitoFootnote, decodeRitoSearchResponse, decodeRitoTextRangeGeometry, encodeRitoSearchRequest, encodeRitoTextRangeRequest } from '../../modules/rito-rn/src/protocol/interaction';
import { decodeRitoArtifact, decodeRitoResource } from '../../modules/rito-rn/src/protocol/artifact';
import { decodeRitoPublication } from '../../modules/rito-rn/src/protocol/publication';

describe('Rito React Native binary protocol', () => {
  it('preserves V1 primitive fields in little-endian order', () => {
    const bytes = new RitoBinaryWriter()
      .writeAscii('RITOTST1')
      .writeU8(7)
      .writeU16(0x1234)
      .writeU32(0x1234_5678)
      .writeU64(0x1234_5678_9abc_defn)
      .writeF64(1.25)
      .writeUtf8('霞鹜文楷')
      .toUint8Array();

    const reader = new RitoBinaryReader(bytes);
    reader.expectHeader('RITOTST1');
    expect(reader.readU8()).toBe(7);
    expect(reader.readU16()).toBe(0x1234);
    expect(reader.readU32()).toBe(0x1234_5678);
    expect(reader.readU64()).toBe(0x1234_5678_9abc_defn);
    expect(reader.readF64()).toBe(1.25);
    expect(reader.readUtf8()).toBe('霞鹜文楷');
    reader.expectExhausted();
  });

  it('rejects malformed headers and truncated fields', () => {
    expect(() => new RitoBinaryReader(Uint8Array.from([82, 73])).expectHeader('RITOART1'))
      .toThrow(BinaryRitoWireError);
    expect(() => new RitoBinaryReader(Uint8Array.from([1])).readU16())
      .toThrow(BinaryRitoWireError);
  });

  it('uses decimal strings for external 64-bit identifiers', () => {
    const identifier = 9_223_372_036_854_775_807n;

    expect(toExternalIdString(identifier)).toBe('9223372036854775807');
    expect(toExternalId('9223372036854775807', 'artifactId')).toBe(identifier);
    expect(() => toExternalId('0', 'artifactId')).toThrow(BinaryRitoWireError);
    expect(() => toExternalId('9223372036854775808', 'artifactId')).toThrow(BinaryRitoWireError);
  });

  it('decodes a V1 display list and maps it to Lunar rendering commands', () => {
    const bytes = new RitoBinaryWriter()
      .writeAscii('RITODL1')
      .writeU32(1)
      .writeU32(1)
      .writeU16(7)
      .writeF64(0)
      .writeF64(0)
      .writeF64(390)
      .writeF64(844)
      .writeU8(1)
      .writeU8(1)
      .writeF32(1)
      .writeF32(0.5)
      .writeF32(0)
      .writeF32(1)
      .writeU8(0)
      .toUint8Array();

    const decoded = decodeRitoDisplayList(bytes);
    const displayList = toReaderV1DisplayList(decoded, 390, 844);

    expect(displayList).toEqual({
      width: 390,
      height: 844,
      commands: [
        {
          kind: 'paintPage',
          rect: { x: 0, y: 0, width: 390, height: 844 },
          paint: { backgroundColor: 'rgba(255, 128, 0, 1)' },
        },
      ],
    });
  });

  it('decodes extended HSL colors without rejecting the DisplayList', () => {
    const bytes = new RitoBinaryWriter()
      .writeAscii('RITODL1').writeU32(1).writeU32(1).writeU16(7)
      .writeF64(0).writeF64(0).writeF64(10).writeF64(10)
      .writeU8(1).writeU8(2).writeF32(120).writeF32(100).writeF32(50).writeF32(1).writeU8(0)
      .toUint8Array();
    expect(decodeRitoDisplayList(bytes).commands[0]).toEqual({
      kind: 'paint-page',
      rect: { x: 0, y: 0, width: 10, height: 10 },
      paint: { backgroundColor: 'rgba(0, 255, 0, 1)' },
    });
  });

  it('preserves typed color spaces and none flags for native artifacts', () => {
    const bytes = new RitoBinaryWriter()
      .writeAscii('RITODL1').writeU32(1).writeU32(1).writeU16(7)
      .writeF64(0).writeF64(0).writeF64(10).writeF64(10)
      .writeU8(1).writeU8(9).writeF32(1).writeF32(0.2).writeF32(0.1).writeF32(0.75).writeU8(0b0010)
      .toUint8Array();
    expect(decodeRitoDisplayListWithTypedColors(bytes).commands[0]).toEqual({
      kind: 'paint-page',
      rect: { x: 0, y: 0, width: 10, height: 10 },
      paint: {
        backgroundColor: {
          space: 'display-p3',
          components: [1, expect.closeTo(0.2), expect.closeTo(0.1)],
          alpha: 0.75,
          none: { component0: false, component1: true, component2: false, alpha: false },
        },
      },
    });
  });

  it('encodes the fixed-size adjacent-page request', () => {
    const bytes = encodeRitoAdjacentRequest({
      sessionId: 1n,
      requestId: 2n,
      fromArtifactId: 3n,
      direction: 'next',
      work: {
        maxTopLevelNodesPerQuantum: 8,
        maxForegroundQuanta: 2,
        localPageCap: 16,
      },
    });

    expect(bytes.byteLength).toBe(60);
    const reader = new RitoBinaryReader(bytes);
    reader.expectHeader('RITONAV1');
    expect(reader.readU32()).toBe(1);
    expect(reader.readU64()).toBe(60n);
    expect(reader.readU64()).toBe(1n);
    expect(reader.readU64()).toBe(2n);
    expect(reader.readU64()).toBe(3n);
    expect(reader.readU32()).toBe(1);
    expect(reader.readU32()).toBe(8);
    expect(reader.readU32()).toBe(2);
    expect(reader.readU32()).toBe(16);
    reader.expectExhausted();
  });

  it('strictly decodes RITOART1 and nested RITORES1 messages', () => {
    const display = new RitoBinaryWriter().writeAscii('RITODL1').writeU32(1).writeU32(0).toUint8Array();
    const artifact = message('RITOART1')
      .writeU32(2).writeU32(1).writeU64(91n).writeU64(12n).writeU64(44n).writeU32(3).writeU64(7001n)
      .writeRecord((locator) => locator.writeUtf8('chapter.xhtml').writeU8(0).writeU8(0).writeU8(0).writeU8(0))
      .writeU32(3).writeU32(7).writeU32(7).writeU32(1).writeU32(7)
      .writeF64(360).writeF64(640).writeU8(0).writeU8(0).writeU8(0)
      .writeU32(0).writeU32(1).writeU32(1).writeRecord((record) => record.writeU32(1).writeU32(0).writeU32(32).writeBytes(new Uint8Array(32)).writeU64(BigInt(display.byteLength)).writeBytes(display))
      .writeU32(1).writeRecord((record) => record.writeU32(0).writeUtf8('images/cover.png'))
      .writeU32(1).writeRecord((record) => record.writeUtf8('Rito Serif').writeUtf8('fonts/serif.woff2').writeUtf8('normal').writeU16(400).writeUtf8('shape-v1').writeU64(8192n))
      .writeU32(0);

    const decoded = decodeRitoArtifact(finish(artifact));
    expect(decoded.artifactId).toBe(7001n);
    expect(decoded.displayList.commandCount).toBe(0);
    expect(decoded.fonts[0]?.family).toBe('Rito Serif');

    const resource = message('RITORES1').writeU64(7001n).writeU32(0).writeUtf8('images/cover.png').writeUtf8('image/png').writeU64(3n).writeBytes(Uint8Array.from([1, 2, 3])).writeU8(1).writeU32(320).writeU8(1).writeU32(480);
    expect(decodeRitoResource(finish(resource)).bytes).toEqual(Uint8Array.from([1, 2, 3]));
  });

  it('strictly decodes publication metadata and nested TOC', () => {
    const publication = message('RITOPUB1')
      .writeU32(2).writeU64(91n)
      .writeRecord((record) => record.writeUtf8('Fixture').writeUtf8('en').writeUtf8('urn:fixture').writeU8(0))
      .writeU32(1)
      .writeRecord((record) => record.writeU32(0).writeU8(1).writeU32(0).writeUtf8('chapter').writeUtf8('chapter.xhtml'))
      .writeU32(1)
      .writeRecord((record) => record.writeU32(0).writeUtf8('Chapter one').writeU8(0).writeU32(0).writeRecord((locator) => locator.writeUtf8('chapter.xhtml').writeU8(1).writeUtf8('start').writeU8(0).writeU8(0).writeU8(0)).writeU32(0));
    const decoded = decodeRitoPublication(finish(publication));
    expect(decoded.metadata.title).toBe('Fixture');
    expect(decoded.toc[0]?.target.kind).toBe('locator');
  });

  it('encodes fixed foreground and background handoff contracts', () => {
    expect(encodeRitoForegroundHandoff({ sessionId: 1n, candidateArtifactId: 3n }).byteLength).toBe(48);
    expect(encodeRitoBackgroundRequest({ sessionId: 1n, expectedVisibleArtifactId: 2n, maxTopLevelNodesPerQuantum: 8 }).byteLength).toBe(40);
    expect(encodeRitoBackgroundHandoff({ sessionId: 1n, expectedVisibleArtifactId: 2n, candidateArtifactId: 3n }).byteLength).toBe(44);

    const foregroundAck = message('RITOFGA1').writeU64(4n).writeU32(0).writeU64(0n).writeU64(3n);
    expect(decodeRitoForegroundHandoffAck(finish(foregroundAck))).toEqual({ intentRequestId: 4n, replacedArtifactId: undefined, visibleArtifactId: 3n });
    const backgroundAck = message('RITOHOA1').writeU64(4n).writeU64(2n).writeU64(3n);
    expect(decodeRitoBackgroundHandoffAck(finish(backgroundAck))).toEqual({ intentRequestId: 4n, replacedArtifactId: 2n, visibleArtifactId: 3n });
  });

  it('encodes and decodes search, text geometry, and footnote contracts', () => {
    const search = encodeRitoSearchRequest({ sessionId: 1n, artifactId: 2n, query: '章', caseSensitive: true, wholeWord: false, limit: 5 });
    expect(search.byteLength).toBeGreaterThan(16);
    const geometry = encodeRitoTextRangeRequest({ sessionId: 1n, artifactId: 2n, pageIndex: 3, start: { blockIndex: 0, lineIndex: 1, runIndex: 2, charIndex: 3 }, end: { blockIndex: 0, lineIndex: 1, runIndex: 2, charIndex: 4 } });
    expect(geometry.byteLength).toBe(72);

    const searchResponse = message('RITOSRS1').writeU64(2n).writeUtf8('章').writeU8(0).writeU32(4).writeU8(1).writeU32(0);
    expect(decodeRitoSearchResponse(finish(searchResponse)).scopeComplete).toBe(true);
    const textResponse = message('RITOTRG1').writeU64(2n).writeU32(3).writeU32(0);
    expect(decodeRitoTextRangeGeometry(finish(textResponse)).rects).toEqual([]);
    const footnote = message('RITOFTN1').writeU64(2n).writeUtf8('#n1').writeU32(0).writeUtf8('说明').writeUtf8('<p>说明</p>');
    expect(decodeRitoFootnote(finish(footnote)).text).toBe('说明');
  });
});

function message(magic: string): RitoBinaryWriter {
  return new RitoBinaryWriter().writeAscii(magic).writeU32(1).writeU64(0n);
}

function finish(writer: RitoBinaryWriter): Uint8Array {
  const bytes = writer.toUint8Array();
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setBigUint64(12, BigInt(bytes.byteLength), true);
  return bytes;
}
