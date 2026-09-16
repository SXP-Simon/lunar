import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  TurboModuleRegistry: { get: () => null },
}));

vi.mock('react-native-nitro-modules', () => ({
  NitroModules: { createHybridObject: () => null },
}));

import { RitoReaderSession } from '../../modules/rito-rn/src/session';
import type { RitoNativeCallResult, RitoNativeReaderModule } from '../../modules/rito-rn/src/native';
import { RitoBinaryWriter } from '../../modules/rito-rn/src/protocol/binary';

describe('RitoReaderSession neighbor navigation', () => {
  it('keeps a peek invisible and commits it through the fast turn method', async () => {
    const calls: string[] = [];
    const native = fakeNative((operation) => {
      calls.push(operation);
      if (operation === 'peekAdjacent') return result(artifactWire(1n, 2n, 2n));
      if (operation === 'commitPeekedArtifact') return result(foregroundAck(2n, 1n, 2n));
      if (operation === 'adoptForeground') return result(foregroundAck(1n, undefined, 1n));
      return result(new Uint8Array());
    });
    const session = new RitoReaderSession(1n, { native });
    await session.adoptForeground({ sessionId: 1n, candidateArtifactId: 1n });

    const request = {
      sessionId: 1n,
      requestId: 2n,
      fromArtifactId: 1n,
      direction: 'next' as const,
    };
    const peeked = await session.peekAdjacent(request);
    expect(peeked?.artifactId).toBe(2n);
    expect(session.currentVisibleArtifactId).toBe(1n);

    const turned = await session.turn(request);
    expect(turned.artifactId).toBe(2n);
    expect(session.currentVisibleArtifactId).toBe(2n);
    expect(calls).toEqual(['adoptForeground', 'peekAdjacent', 'commitPeekedArtifact']);
  });

  it('shares concurrent resource reads and validates the returned identity', async () => {
    const calls: string[] = [];
    const native = fakeNative((operation) => {
      calls.push(operation);
      if (operation === 'readResource') return result(resourceWire(2n, 'cover.png'));
      return result(new Uint8Array());
    });
    const session = new RitoReaderSession(1n, { native });
    const [first, second] = await Promise.all([
      session.readResource(2n, 0, 'cover.png'),
      session.readResource(2n, 0, 'cover.png'),
    ]);
    expect(first.bytes).toEqual(Uint8Array.from([1, 2, 3]));
    expect(second).toBe(first);
    expect(calls.filter((operation) => operation === 'readResource')).toHaveLength(1);
  });

  it('keeps background pagination behind an uncommitted foreground candidate', async () => {
    let adoptionCount = 0;
    const native = fakeNative((operation) => {
      if (operation === 'requestAdjacent') return result(artifactWire(1n, 2n, 2n));
      if (operation === 'adoptForeground') {
        adoptionCount += 1;
        return result(foregroundAck(adoptionCount === 1 ? 1n : 2n, adoptionCount === 1 ? undefined : 1n, adoptionCount === 1 ? 1n : 2n));
      }
      return result(new Uint8Array());
    });
    const session = new RitoReaderSession(1n, { native });
    await session.adoptForeground({ sessionId: 1n, candidateArtifactId: 1n });
    const candidate = await session.requestAdjacent({
      sessionId: 1n,
      requestId: 2n,
      fromArtifactId: 1n,
      direction: 'next',
    });
    await expect(session.advanceBackground({ sessionId: 1n, expectedVisibleArtifactId: 1n, maxTopLevelNodesPerQuantum: 8 })).rejects.toMatchObject({ status: 8 });
    await session.adoptForeground({ sessionId: 1n, expectedVisibleArtifactId: 1n, candidateArtifactId: candidate.artifactId });
    expect(session.currentVisibleArtifactId).toBe(2n);
  });
});

function fakeNative(handler: (operation: string) => RitoNativeCallResult): RitoNativeReaderModule {
  const call = (operation: string) => Promise.resolve(handler(operation));
  return {
    open: () => call('open'),
    readPublication: () => call('readPublication'),
    requestArtifact: () => call('requestArtifact'),
    requestAdjacent: () => call('requestAdjacent'),
    peekAdjacent: () => call('peekAdjacent'),
    adoptForeground: () => call('adoptForeground'),
    commitPeekedArtifact: () => call('commitPeekedArtifact'),
    advanceBackground: () => call('advanceBackground'),
    adoptBackground: () => call('adoptBackground'),
    readResource: () => call('readResource'),
    search: () => call('search'),
    textRangeGeometry: () => call('textRangeGeometry'),
    readFootnote: () => call('readFootnote'),
    releaseArtifact: () => call('releaseArtifact'),
    dispose: () => call('dispose'),
  };
}

function result(data: Uint8Array): RitoNativeCallResult {
  return { status: 0, data, error: '' };
}

function artifactWire(sessionId: bigint, requestId: bigint, artifactId: bigint): Uint8Array {
  const display = new RitoBinaryWriter().writeAscii('RITODL1').writeU32(2).writeF64(1).writeU32(0).toUint8Array();
  const writer = new RitoBinaryWriter()
    .writeAscii('RITOART1').writeU32(1).writeU64(0n)
    .writeU32(5).writeU32(1).writeU64(sessionId).writeU64(requestId).writeU64(1n).writeU32(1).writeU64(artifactId)
    .writeRecord((locator) => locator.writeUtf8('chapter.xhtml').writeU8(0).writeU8(0).writeU8(0).writeU8(0))
    .writeU32(4).writeU32(0).writeU32(0).writeU32(1).writeU32(1)
    .writeF64(390).writeF64(844).writeU8(0).writeU8(0)
    .writeU32(0).writeU32(0).writeU32(0)
    .writeRecord((displayRecord) => displayRecord.writeU32(2).writeU32(0).writeU32(32).writeBytes(new Uint8Array(32)).writeU64(BigInt(display.byteLength)).writeBytes(display))
    .writeU32(0).writeU32(0).writeU32(0);
  return finish(writer);
}

function foregroundAck(intentRequestId: bigint, replacedArtifactId: bigint | undefined, visibleArtifactId: bigint): Uint8Array {
  return finish(new RitoBinaryWriter().writeAscii('RITOFGA1').writeU32(1).writeU64(48n)
    .writeU64(intentRequestId).writeU32(replacedArtifactId === undefined ? 0 : 1)
    .writeU64(replacedArtifactId ?? 0n).writeU64(visibleArtifactId));
}

function resourceWire(artifactId: bigint, href: string): Uint8Array {
  return finish(new RitoBinaryWriter().writeAscii('RITORES1').writeU32(1).writeU64(0n)
    .writeU64(artifactId).writeU32(0).writeUtf8(href).writeUtf8('image/png')
    .writeU64(3n).writeBytes(Uint8Array.from([1, 2, 3])).writeU8(0).writeU8(0));
}

function finish(writer: RitoBinaryWriter): Uint8Array {
  const bytes = writer.toUint8Array();
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setBigUint64(12, BigInt(bytes.byteLength), true);
  return bytes;
}
