import { RitoWireError } from '../errors';
import { RitoBinaryReader } from './binary';
import { decodeRitoArtifact } from './artifact';
import type { RitoBackgroundAdvance, RitoBackgroundHandoffAck, RitoBackgroundState, RitoForegroundHandoffAck } from './artifact-types';

export function decodeRitoForegroundHandoffAck(data: Uint8Array): RitoForegroundHandoffAck {
  const reader = fixed(data, 'RITOFGA1', 48);
  const result = { intentRequestId: reader.readExternalId('intent request id'), replacedArtifactId: reader.readFixedOptionalExternalId('replaced artifact id'), visibleArtifactId: reader.readExternalId('visible artifact id') };
  reader.expectExhausted();
  return result;
}

export function decodeRitoBackgroundHandoffAck(data: Uint8Array): RitoBackgroundHandoffAck {
  const reader = fixed(data, 'RITOHOA1', 44);
  const result = { intentRequestId: reader.readExternalId('intent request id'), replacedArtifactId: reader.readExternalId('replaced artifact id'), visibleArtifactId: reader.readExternalId('visible artifact id') };
  reader.expectExhausted();
  return result;
}

export function decodeRitoBackgroundAdvance(data: Uint8Array): RitoBackgroundAdvance {
  const reader = new RitoBinaryReader(data);
  reader.expectHeader('RITOBGA1');
  if (reader.readU32() !== 1) throw new RitoWireError('Unsupported RITOBGA1 wire version.');
  if (reader.readU64() !== BigInt(data.byteLength)) throw new RitoWireError('Background advance total length does not match input.');
  const state = readEnum(reader, ['started', 'advanced', 'reused', 'candidate-pending', 'complete', 'indexing'] as const);
  const intentRequestId = reader.readExternalId('intent request id');
  const replacesArtifactId = reader.readExternalId('replaces artifact id');
  const moves = reader.readBoolean('background moves visible content');
  const artifactBytes = reader.readBlob('background artifact');
  if ((state === 'candidate-pending' || state === 'indexing') && artifactBytes.byteLength !== 0) throw new RitoWireError(`${state} background advance must not carry an artifact.`);
  const artifact = artifactBytes.byteLength === 0 ? undefined : decodeRitoArtifact(artifactBytes);
  reader.expectExhausted();
  return { state, intentRequestId, replacesArtifactId, movesVisibleContent: moves && artifact !== undefined, artifact };
}

function fixed(data: Uint8Array, magic: string, length: number): RitoBinaryReader { if (data.byteLength !== length) throw new RitoWireError(`${magic} must be exactly ${length} bytes.`); const reader = new RitoBinaryReader(data); reader.expectHeader(magic); if (reader.readU32() !== 1) throw new RitoWireError(`Unsupported ${magic} wire version.`); if (reader.readU64() !== BigInt(length)) throw new RitoWireError(`${magic} total length does not match input.`); return reader; }
function readEnum<T extends readonly string[]>(reader: RitoBinaryReader, values: T): T[number] { const value = values[reader.readU32()]; if (!value) throw new RitoWireError('Unknown background state.'); return value; }
