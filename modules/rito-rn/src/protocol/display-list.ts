import { RitoWireError } from '../errors';
import { RitoBinaryReader } from './binary';
import type {
  RitoBlockPaint,
  RitoBorderPaintEdge,
  RitoDisplayCommand,
  RitoDisplayLength,
  RitoDisplayList,
  RitoDisplayRect,
  RitoDisplayTransform,
  RitoRunPaint,
} from './display-types';

const COLOR_SPACES = [
  'srgb', 'hsl', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'srgb-linear',
  'display-p3', 'display-p3-linear', 'a98-rgb', 'prophoto-rgb', 'rec2020',
  'xyz-d50', 'xyz-d65',
] as const;
const BORDER_STYLES = [
  'none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset',
] as const;

/** Strict decoder for Rito's paint-ready RITODL1 V1 payload. */
export function decodeRitoDisplayList(data: Uint8Array): RitoDisplayList {
  const reader = new RitoBinaryReader(data);
  reader.expectHeader('RITODL1');
  const version = reader.readU32();
  if (version !== 1) {
    throw new RitoWireError(`Unsupported RITODL1 version: ${version}.`);
  }
  const commandCount = reader.readCount('RITODL1 display command');
  const commands: RitoDisplayCommand[] = [];
  for (let index = 0; index < commandCount; index += 1) {
    commands.push(readCommand(reader));
  }
  reader.expectExhausted();
  return { formatVersion: 1, commands };
}

function readCommand(reader: RitoBinaryReader): RitoDisplayCommand {
  switch (reader.readU16()) {
    case 1:
      return { kind: 'push-state' };
    case 2:
      return { kind: 'pop-state' };
    case 3:
      return { kind: 'translate', dx: reader.readF64(), dy: reader.readF64() };
    case 4:
      return { kind: 'opacity', value: reader.readF64() };
    case 5:
      return readTransform(reader);
    case 6:
      return {
        kind: 'clip-rect',
        rect: readRect(reader),
        radius: reader.readOption('clip radius', () => ({ rx: reader.readF64(), ry: reader.readF64() })),
      };
    case 7:
      return {
        kind: 'paint-page',
        rect: readRect(reader),
        paint: { backgroundColor: reader.readOption('page background color', () => readColor(reader)) },
      };
    case 8:
      return {
        kind: 'paint-block',
        rect: readRect(reader),
        paint: readBlockPaint(reader),
        borderBox: reader.readOption('block border box', () => readBorderBox(reader)),
      };
    case 9:
      return readText(reader, false);
    case 10:
      return readText(reader, true);
    case 11:
      return {
        kind: 'paint-image',
        src: reader.readUtf8(),
        rect: readRect(reader),
        alt: reader.readOption('image alternative', () => reader.readUtf8()),
        href: reader.readOption('image href', () => reader.readUtf8()),
      };
    case 12:
      return {
        kind: 'paint-horizontal-rule',
        rect: readRect(reader),
        paint: { color: readColor(reader), style: readBorderStyle(reader) },
      };
    default:
      throw new RitoWireError('RITODL1 contains an unknown display command opcode.');
  }
}

function readTransform(reader: RitoBinaryReader): RitoDisplayCommand {
  const origin = { x: reader.readF64(), y: reader.readF64() };
  const boxSize = { width: reader.readF64(), height: reader.readF64() };
  const count = reader.readCount('transform');
  const transforms: RitoDisplayTransform[] = [];
  for (let index = 0; index < count; index += 1) {
    switch (reader.readU8()) {
      case 1:
        transforms.push({ kind: 'rotate', radians: reader.readF64() });
        break;
      case 2:
        transforms.push({ kind: 'scale', sx: reader.readF64(), sy: reader.readF64() });
        break;
      case 3:
        transforms.push({ kind: 'translate', x: readLength(reader), y: readLength(reader) });
        break;
      default:
        throw new RitoWireError('RITODL1 contains an unknown transform opcode.');
    }
  }
  return { kind: 'transform', origin, boxSize, transforms };
}

function readText(reader: RitoBinaryReader, ruby: boolean): RitoDisplayCommand {
  const text = reader.readUtf8();
  const rect = readRect(reader);
  const paint = readRunPaint(reader);
  const lineHeightPx = reader.readOption('text line height', () => reader.readF64());
  const href = reader.readOption('text href', () => reader.readUtf8());
  const sourceText = reader.readOption('source text', () => reader.readUtf8());
  const sourceOffset = reader.readOption('source text offset', () => reader.readU64());
  reader.readOption('ruby align', () => reader.readUtf8());
  if (ruby) {
    return { kind: 'paint-ruby', text, rect, paint, lineHeightPx, href, sourceText, sourceTextOffset: sourceOffset };
  }
  return { kind: 'paint-text', text, rect, paint, lineHeightPx, href, sourceText, sourceTextOffset: sourceOffset };
}

function readBlockPaint(reader: RitoBinaryReader): RitoBlockPaint {
  const background = reader.readOption('block background', () => ({
    color: reader.readOption('background color', () => readColor(reader)),
    image: reader.readOption('background image', () => reader.readUtf8()),
    size: reader.readOption('background size', () => readEnum(reader, ['auto', 'cover', 'contain'] as const, 'background size')),
    repeat: reader.readOption('background repeat', () => {
      const repeat = readEnum(reader, ['repeat', 'no-repeat', 'repeat-x', 'repeat-y', 'space', 'round'] as const, 'background repeat');
      if (repeat !== 'repeat' && repeat !== 'no-repeat') {
        throw new RitoWireError(`RITODL1 background repeat ${repeat} requires an extended Skia renderer.`);
      }
      return repeat;
    }),
    position: reader.readOption('background position', () => ({ x: readLength(reader), y: readLength(reader) })),
  }));
  const border = reader.readOption('block border', () => ({
    top: reader.readOption('top block border', () => readBorderEdge(reader)),
    right: reader.readOption('right block border', () => readBorderEdge(reader)),
    bottom: reader.readOption('bottom block border', () => readBorderEdge(reader)),
    left: reader.readOption('left block border', () => readBorderEdge(reader)),
  }));
  const radius = reader.readOption('block radius', () => {
    switch (reader.readU8()) {
      case 1:
        return { px: reader.readF64() };
      case 2:
        return { pct: reader.readF64() };
      case 3:
        throw new RitoWireError('RITODL1 per-corner block radii require an extended Skia renderer.');
      default:
        throw new RitoWireError('RITODL1 contains an unknown block radius type.');
    }
  });
  const boxShadow = Array.from({ length: reader.readCount('box shadow') }, () => ({
    offsetX: reader.readF64(), offsetY: reader.readF64(), blur: reader.readF64(), spread: reader.readF64(),
    color: readColor(reader), inset: reader.readBoolean('box shadow inset'),
  }));
  return { background, border, radius, boxShadow };
}

function readRunPaint(reader: RitoBinaryReader): RitoRunPaint {
  const font = {
    family: reader.readUtf8(), sizePx: reader.readF64(), weight: reader.readF64(),
    style: readEnum(reader, ['normal', 'italic'] as const, 'font style'),
  };
  const color = readColor(reader);
  const wordSpacingPx = reader.readOption('word spacing', () => reader.readF64());
  const letterSpacingPx = reader.readOption('letter spacing', () => reader.readF64());
  const backgroundColor = reader.readOption('text background color', () => readColor(reader));
  const backgroundRadius = reader.readOption('text background radius', () => reader.readF64());
  const textShadow = Array.from({ length: reader.readCount('text shadow') }, () => ({
    offsetX: reader.readF64(), offsetY: reader.readF64(), blur: reader.readF64(), color: readColor(reader),
  }));
  const decoration = reader.readOption('text decoration', () => ({
    kind: readEnum(reader, ['underline', 'line-through'] as const, 'text decoration'),
    y: reader.readF64(), thickness: reader.readF64(), color: readColor(reader),
  }));
  const padding = reader.readOption('text padding', () => ({
    top: reader.readF64(), right: reader.readF64(), bottom: reader.readF64(), left: reader.readF64(),
  }));
  const border = reader.readOption('text border', () => ({
    top: reader.readOption('text top border', () => readRunBorderEdge(reader)),
    bottom: reader.readOption('text bottom border', () => readRunBorderEdge(reader)),
    start: reader.readOption('text start border', () => readRunBorderEdge(reader)),
    end: reader.readOption('text end border', () => readRunBorderEdge(reader)),
  }));
  return { font, color, wordSpacingPx, letterSpacingPx, backgroundColor, backgroundRadius, textShadow, decoration, padding, border };
}

function readRunBorderEdge(reader: RitoBinaryReader) {
  return { widthPx: reader.readF64(), paint: readBorderEdge(reader) };
}

function readBorderEdge(reader: RitoBinaryReader): RitoBorderPaintEdge {
  return { color: readColor(reader), style: readBorderStyle(reader) };
}

function readBorderStyle(reader: RitoBinaryReader): RitoBorderPaintEdge['style'] {
  const style = readEnum(reader, BORDER_STYLES, 'border style');
  if (style !== 'solid' && style !== 'dotted' && style !== 'dashed') {
    throw new RitoWireError(`RITODL1 border style ${style} requires an extended Skia renderer.`);
  }
  return style;
}

function readColor(reader: RitoBinaryReader): string {
  const space = readEnum(reader, COLOR_SPACES, 'color space');
  const red = reader.readF32();
  const green = reader.readF32();
  const blue = reader.readF32();
  const alpha = reader.readF32();
  const none = reader.readU8();
  if ((none & 0xf0) !== 0) {
    throw new RitoWireError('RITODL1 color none flags contain unknown bits.');
  }
  if (space !== 'srgb' || none !== 0) {
    throw new RitoWireError(`RITODL1 color space ${space} requires an extended Skia renderer.`);
  }
  return `rgba(${channel(red)}, ${channel(green)}, ${channel(blue)}, ${clamp(alpha)})`;
}

function readRect(reader: RitoBinaryReader): RitoDisplayRect {
  return { x: reader.readF64(), y: reader.readF64(), width: reader.readF64(), height: reader.readF64() };
}

function readBorderBox(reader: RitoBinaryReader): { topWidth: number; rightWidth: number; bottomWidth: number; leftWidth: number } {
  return { topWidth: reader.readF64(), rightWidth: reader.readF64(), bottomWidth: reader.readF64(), leftWidth: reader.readF64() };
}

function readLength(reader: RitoBinaryReader): RitoDisplayLength {
  const unit = reader.readU8();
  const value = reader.readF64();
  if (unit === 1) return { unit: 'px', value };
  if (unit === 2) return { unit: 'percent', value };
  throw new RitoWireError('RITODL1 contains an unknown length unit.');
}

function readEnum<T extends readonly string[]>(reader: RitoBinaryReader, values: T, field: string): T[number] {
  const tag = reader.readU8();
  const value = values[tag - 1];
  if (!value) {
    throw new RitoWireError(`RITODL1 contains an unknown ${field} tag.`);
  }
  return value;
}

function channel(value: number): number {
  return Math.round(clamp(value) * 255);
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
