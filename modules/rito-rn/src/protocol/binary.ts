import { RitoWireError } from '../errors';

const textDecoder = new TextDecoder('utf-8', { fatal: true });
const textEncoder = new TextEncoder();
const MAX_INT64 = 0x7fff_ffff_ffff_ffffn;

export class RitoBinaryReader {
  private readonly bytes: Uint8Array;
  private readonly view: DataView;
  private offset = 0;

  constructor(data: ArrayBuffer | Uint8Array) {
    this.bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
  }

  get remaining(): number {
    return this.bytes.byteLength - this.offset;
  }

  readAscii(length: number): string {
    this.require(length);
    const value = String.fromCharCode(...this.bytes.subarray(this.offset, this.offset + length));
    this.offset += length;
    return value;
  }

  readU8(): number {
    this.require(1);
    return this.bytes[this.offset++]!;
  }

  readU16(): number {
    this.require(2);
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  readU32(): number {
    this.require(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readU64(): bigint {
    this.require(8);
    const value = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return value;
  }

  readF64(): number {
    this.require(8);
    const value = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return value;
  }

  readF32(): number {
    this.require(4);
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    if (!Number.isFinite(value)) {
      throw new RitoWireError('Rito wire floats must be finite.');
    }
    return value;
  }

  readCount(field: string, maximum = 1_000_000): number {
    const value = this.readU32();
    if (value > maximum) {
      throw new RitoWireError(`${field} exceeds the collection item limit.`);
    }
    return value;
  }

  readOption<T>(field: string, read: () => T): T | undefined {
    const tag = this.readU8();
    if (tag === 0) {
      return undefined;
    }
    if (tag === 1) {
      return read();
    }
    throw new RitoWireError(`Unknown ${field} option tag: ${tag}.`);
  }

  readBoolean(field: string): boolean {
    const tag = this.readU8();
    if (tag === 0) {
      return false;
    }
    if (tag === 1) {
      return true;
    }
    throw new RitoWireError(`Unknown ${field} boolean tag: ${tag}.`);
  }

  readBytes(length: number): Uint8Array {
    this.require(length);
    const value = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  readFixedBytes(length: number, field: string): Uint8Array {
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new RitoWireError(`${field} has an invalid byte length.`);
    }
    const declared = this.readU32();
    if (declared !== length) {
      throw new RitoWireError(`${field} must contain ${length} bytes.`);
    }
    return this.readBytes(length);
  }

  readBlob(field: string, maximum = 256 * 1024 * 1024): Uint8Array {
    const length = this.readU64();
    if (length > BigInt(maximum)) {
      throw new RitoWireError(
        `${field} exceeds the byte limit: declared ${length.toString()} bytes, maximum ${maximum} bytes, ${this.remaining} bytes remain.`,
      );
    }
    return this.readBytes(Number(length));
  }

  readRecord<T>(field: string, decode: (reader: RitoBinaryReader) => T): T {
    const length = this.readU64();
    if (length > BigInt(this.remaining)) {
      throw new RitoWireError(`${field} record exceeds the remaining message bytes.`);
    }
    const record = new RitoBinaryReader(this.readBytes(Number(length)));
    const value = decode(record);
    record.expectExhausted();
    return value;
  }

  readExternalId(field: string): bigint {
    const value = this.readU64();
    if (value <= 0n || value > MAX_INT64) {
      throw new RitoWireError(`${field} must be within 1..=INT64_MAX.`);
    }
    return value;
  }

  readFixedOptionalExternalId(field: string): bigint | undefined {
    const present = this.readU32();
    const value = this.readU64();
    if (present === 0) {
      if (value !== 0n) {
        throw new RitoWireError(`${field} has a value while marked absent.`);
      }
      return undefined;
    }
    if (present !== 1 || value <= 0n || value > MAX_INT64) {
      throw new RitoWireError(`${field} contains an invalid optional external ID.`);
    }
    return value;
  }

  readUtf8(): string {
    const length = this.readU32();
    return textDecoder.decode(this.readBytes(length));
  }

  expectHeader(name: string): void {
    const received = this.readAscii(name.length);
    if (received !== name) {
      throw new RitoWireError(`Expected ${name}, received ${received || 'an empty header'}.`);
    }
  }

  expectExhausted(): void {
    if (this.remaining !== 0) {
      throw new RitoWireError(`Rito wire message has ${this.remaining} unexpected trailing bytes.`);
    }
  }

  private require(length: number): void {
    if (!Number.isSafeInteger(length) || length < 0 || length > this.remaining) {
      throw new RitoWireError('Rito wire message ended before a complete field could be read.');
    }
  }
}

export class RitoBinaryWriter {
  private readonly parts: Uint8Array[] = [];

  writeAscii(value: string): this {
    if (!/^[\x20-\x7e]+$/.test(value)) {
      throw new RitoWireError('Rito wire headers must be printable ASCII.');
    }
    this.parts.push(Uint8Array.from(value, (character) => character.charCodeAt(0)));
    return this;
  }

  writeU8(value: number): this {
    const bytes = new Uint8Array(1);
    new DataView(bytes.buffer).setUint8(0, this.requireInteger(value, 0xff));
    this.parts.push(bytes);
    return this;
  }

  writeU16(value: number): this {
    const bytes = new Uint8Array(2);
    new DataView(bytes.buffer).setUint16(0, this.requireInteger(value, 0xffff), true);
    this.parts.push(bytes);
    return this;
  }

  writeU32(value: number): this {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, this.requireInteger(value, 0xffff_ffff), true);
    this.parts.push(bytes);
    return this;
  }

  writeU64(value: bigint): this {
    if (value < 0n || value > MAX_INT64) {
      throw new RitoWireError('Rito external IDs must be within 1..=INT64_MAX.');
    }
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigUint64(0, value, true);
    this.parts.push(bytes);
    return this;
  }

  writeF64(value: number): this {
    if (!Number.isFinite(value)) {
      throw new RitoWireError('Rito wire floats must be finite.');
    }
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, value, true);
    this.parts.push(bytes);
    return this;
  }

  writeF32(value: number): this {
    if (!Number.isFinite(value)) {
      throw new RitoWireError('Rito wire floats must be finite.');
    }
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setFloat32(0, value, true);
    this.parts.push(bytes);
    return this;
  }

  writeBytes(value: Uint8Array): this {
    this.parts.push(value.slice());
    return this;
  }

  writeUtf8(value: string): this {
    const bytes = textEncoder.encode(value);
    this.writeU32(bytes.byteLength);
    this.writeBytes(bytes);
    return this;
  }

  writeRecord(write: (writer: RitoBinaryWriter) => void): this {
    const body = new RitoBinaryWriter();
    write(body);
    const bytes = body.toUint8Array();
    this.writeU64(BigInt(bytes.byteLength));
    this.writeBytes(bytes);
    return this;
  }

  toUint8Array(): Uint8Array {
    const length = this.parts.reduce((total, part) => total + part.byteLength, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    for (const part of this.parts) {
      output.set(part, offset);
      offset += part.byteLength;
    }
    return output;
  }

  private requireInteger(value: number, maximum: number): number {
    if (!Number.isInteger(value) || value < 0 || value > maximum) {
      throw new RitoWireError(`Expected an integer in 0..${maximum}.`);
    }
    return value;
  }
}

export function toExternalId(value: string, field: string): bigint {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new RitoWireError(`${field} must be a positive decimal integer.`);
  }
  const result = BigInt(value);
  if (result > MAX_INT64) {
    throw new RitoWireError(`${field} exceeds INT64_MAX.`);
  }
  return result;
}

export function toExternalIdString(value: bigint): string {
  if (value <= 0n || value > MAX_INT64) {
    throw new RitoWireError('Rito external IDs must be within 1..=INT64_MAX.');
  }
  return value.toString(10);
}
