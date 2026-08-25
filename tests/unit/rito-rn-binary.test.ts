import { describe, expect, it } from 'vitest';

import {
  RitoBinaryReader,
  RitoBinaryWriter,
  toExternalId,
  toExternalIdString,
} from '../../modules/rito-rn/src/protocol/binary';
import { RitoWireError as BinaryRitoWireError } from '../../modules/rito-rn/src/errors';
import { decodeRitoDisplayList } from '../../modules/rito-rn/src/protocol/display-list';
import { toReaderV1DisplayList } from '../../src/reader/rito/rito-v1-display-list';
import { encodeRitoAdjacentRequest } from '../../modules/rito-rn/src/protocol/requests';

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
});
