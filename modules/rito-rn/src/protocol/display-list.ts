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
  RitoTypedColor,
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
export function decodeRitoDisplayList(data: Uint8Array, options: { readonly preserveColorSpaces?: boolean } = {}): RitoDisplayList {
  const reader = new RitoBinaryReader(data);
  reader.expectHeader('RITODL1');
  const version = reader.readU32();
  if (version !== 1) {
    throw new RitoWireError(`Unsupported RITODL1 version: ${version}.`);
  }
  const commandCount = reader.readCount('RITODL1 display command');
  const commands: RitoDisplayCommand[] = [];
  for (let index = 0; index < commandCount; index += 1) {
    commands.push(readCommand(reader, options.preserveColorSpaces === true));
  }
  reader.expectExhausted();
  return { formatVersion: 1, commands };
}

export function decodeRitoDisplayListWithTypedColors(data: Uint8Array): RitoDisplayList {
  return decodeRitoDisplayList(data, { preserveColorSpaces: true });
}

function readCommand(reader: RitoBinaryReader, typedColors: boolean): RitoDisplayCommand {
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
        paint: { backgroundColor: reader.readOption('page background color', () => readColor(reader, typedColors)) },
      };
    case 8:
      return {
        kind: 'paint-block',
        rect: readRect(reader),
        paint: readBlockPaint(reader, typedColors),
        borderBox: reader.readOption('block border box', () => readBorderBox(reader)),
      };
    case 9:
      return readText(reader, false, typedColors);
    case 10:
      return readText(reader, true, typedColors);
    case 11:
      return {
        kind: 'paint-image',
        src: reader.readUtf8(),
        rect: readRect(reader),
        alt: reader.readOption('image alternative', () => reader.readUtf8()),
        href: reader.readOption('image href', () => reader.readUtf8()),
        sourceRect: reader.readOption('image source rect', () => readRect(reader)),
      };
    case 12:
      return {
        kind: 'paint-horizontal-rule',
        rect: readRect(reader),
        paint: { color: readColor(reader, typedColors), style: readBorderStyle(reader) },
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

function readText(reader: RitoBinaryReader, ruby: boolean, typedColors: boolean): RitoDisplayCommand {
  const text = reader.readUtf8();
  const rect = readRect(reader);
  const paint = readRunPaint(reader, typedColors);
  const lineHeightPx = reader.readOption('text line height', () => reader.readF64());
  const href = reader.readOption('text href', () => reader.readUtf8());
  const sourceText = reader.readOption('source text', () => reader.readUtf8());
  const sourceOffset = reader.readOption('source text offset', () => reader.readU64());
  const rubyAlign = reader.readOption('ruby align', () => reader.readUtf8());
  if (ruby) {
    return { kind: 'paint-ruby', text, rect, paint, lineHeightPx, href, sourceText, sourceTextOffset: sourceOffset, rubyAlign };
  }
  return { kind: 'paint-text', text, rect, paint, lineHeightPx, href, sourceText, sourceTextOffset: sourceOffset };
}

function readBlockPaint(reader: RitoBinaryReader, typedColors: boolean): RitoBlockPaint {
  const background = reader.readOption('block background', () => ({
    color: reader.readOption('background color', () => readColor(reader, typedColors)),
    image: reader.readOption('background image', () => reader.readUtf8()),
    size: reader.readOption('background size', () => readBackgroundSize(reader)),
    repeat: reader.readOption('background repeat', () => {
      return readEnum(reader, ['repeat', 'no-repeat', 'repeat-x', 'repeat-y', 'space', 'round'] as const, 'background repeat');
    }),
    position: reader.readOption('background position', () => ({ x: readLength(reader), y: readLength(reader) })),
  }));
  const border = reader.readOption('block border', () => ({
    top: reader.readOption('top block border', () => readBorderEdge(reader, typedColors)),
    right: reader.readOption('right block border', () => readBorderEdge(reader, typedColors)),
    bottom: reader.readOption('bottom block border', () => readBorderEdge(reader, typedColors)),
    left: reader.readOption('left block border', () => readBorderEdge(reader, typedColors)),
  }));
  const radius = reader.readOption('block radius', () => {
    switch (reader.readU8()) {
      case 1:
        return { px: reader.readF64() };
      case 2:
        return { pct: reader.readF64() };
      case 3:
        return {
          corners: {
            topLeft: reader.readF64(),
            topRight: reader.readF64(),
            bottomRight: reader.readF64(),
            bottomLeft: reader.readF64(),
          },
        };
      default:
        throw new RitoWireError('RITODL1 contains an unknown block radius type.');
    }
  });
  const boxShadow = Array.from({ length: reader.readCount('box shadow') }, () => ({
    offsetX: reader.readF64(), offsetY: reader.readF64(), blur: reader.readF64(), spread: reader.readF64(),
    color: readColor(reader, typedColors), inset: reader.readBoolean('box shadow inset'),
  }));
  return { background, border, radius, boxShadow };
}

function readRunPaint(reader: RitoBinaryReader, typedColors: boolean): RitoRunPaint {
  const font = {
    family: reader.readUtf8(), sizePx: reader.readF64(), weight: reader.readF64(),
    style: readEnum(reader, ['normal', 'italic'] as const, 'font style'),
  };
  const color = readColor(reader, typedColors);
  const wordSpacingPx = reader.readOption('word spacing', () => reader.readF64());
  const letterSpacingPx = reader.readOption('letter spacing', () => reader.readF64());
  const backgroundColor = reader.readOption('text background color', () => readColor(reader, typedColors));
  const backgroundRadius = reader.readOption('text background radius', () => reader.readF64());
  const textShadow = Array.from({ length: reader.readCount('text shadow') }, () => ({
    offsetX: reader.readF64(), offsetY: reader.readF64(), blur: reader.readF64(), color: readColor(reader, typedColors),
  }));
  const decoration = reader.readOption('text decoration', () => ({
    kind: readEnum(reader, ['underline', 'line-through'] as const, 'text decoration'),
    y: reader.readF64(), thickness: reader.readF64(), color: readColor(reader, typedColors),
  }));
  const padding = reader.readOption('text padding', () => ({
    top: reader.readF64(), right: reader.readF64(), bottom: reader.readF64(), left: reader.readF64(),
  }));
  const border = reader.readOption('text border', () => ({
    top: reader.readOption('text top border', () => readRunBorderEdge(reader, typedColors)),
    bottom: reader.readOption('text bottom border', () => readRunBorderEdge(reader, typedColors)),
    start: reader.readOption('text start border', () => readRunBorderEdge(reader, typedColors)),
    end: reader.readOption('text end border', () => readRunBorderEdge(reader, typedColors)),
  }));
  const box = reader.readOption('text box offsets', () => ({
    topPx: reader.readF64(),
    bottomPx: reader.readF64(),
  }));
  const boxStart = reader.readBoolean('text box start');
  const boxEnd = reader.readBoolean('text box end');
  return {
    font,
    color,
    wordSpacingPx,
    letterSpacingPx,
    backgroundColor,
    backgroundRadius,
    textShadow,
    decoration,
    padding,
    border,
    box,
    boxStart,
    boxEnd,
  };
}

function readBackgroundSize(reader: RitoBinaryReader) {
  const tag = reader.readU8();
  if (tag === 1) return 'auto' as const;
  if (tag === 2) return 'cover' as const;
  if (tag === 3) return 'contain' as const;
  if (tag === 4) {
    return {
      x: reader.readOption('background width', () => readLength(reader)),
      y: reader.readOption('background height', () => readLength(reader)),
    };
  }
  throw new RitoWireError('RITODL1 contains an unknown background size tag.');
}

function readRunBorderEdge(reader: RitoBinaryReader, typedColors = false) {
  return { widthPx: reader.readF64(), paint: readBorderEdge(reader, typedColors) };
}

function readBorderEdge(reader: RitoBinaryReader, typedColors = false): RitoBorderPaintEdge {
  return { color: readColor(reader, typedColors), style: readBorderStyle(reader) };
}

function readBorderStyle(reader: RitoBinaryReader): RitoBorderPaintEdge['style'] {
  const style = readEnum(reader, BORDER_STYLES, 'border style');
  return style;
}

function readColor(reader: RitoBinaryReader, typedColors = false): string | RitoTypedColor {
  const space = readEnum(reader, COLOR_SPACES, 'color space');
  const red = reader.readF32();
  const green = reader.readF32();
  const blue = reader.readF32();
  const alpha = reader.readF32();
  const none = reader.readU8();
  if ((none & 0xf0) !== 0) {
    throw new RitoWireError('RITODL1 color none flags contain unknown bits.');
  }
  if (typedColors) {
    return {
      space,
      components: [red, green, blue],
      alpha,
      none: {
        component0: Boolean(none & 1), component1: Boolean(none & 2),
        component2: Boolean(none & 4), alpha: Boolean(none & 8),
      },
    };
  }
  return toRgba(space, none & 1 ? 0 : red, none & 2 ? 0 : green, none & 4 ? 0 : blue, none & 8 ? 0 : alpha);
}

function toRgba(space: typeof COLOR_SPACES[number], c0: number, c1: number, c2: number, alpha: number): string {
  let red = c0;
  let green = c1;
  let blue = c2;
  if (space === 'hsl') [red, green, blue] = hsl(c0, c1 / 100, c2 / 100);
  else if (space === 'hwb') [red, green, blue] = hwb(c0, c1 / 100, c2 / 100);
  else if (space === 'srgb-linear') [red, green, blue] = [linearToSrgb(c0), linearToSrgb(c1), linearToSrgb(c2)];
  else if (space === 'oklab' || space === 'oklch') {
    const angle = space === 'oklch' ? c2 * Math.PI / 180 : 0;
    [red, green, blue] = linearRgbToSrgb(oklabToLinear(c0, space === 'oklch' ? c1 * Math.cos(angle) : c1, space === 'oklch' ? c1 * Math.sin(angle) : c2));
  } else if (space === 'lab' || space === 'lch') {
    const angle = space === 'lch' ? c2 * Math.PI / 180 : 0;
    const xyz = labToXyz(c0, space === 'lch' ? c1 * Math.cos(angle) : c1, space === 'lch' ? c1 * Math.sin(angle) : c2);
    [red, green, blue] = linearRgbToSrgb(matrix(d50ToD65(xyz), [3.2409699419, -1.5373831776, -0.4986107603, -0.9692436363, 1.8759675015, 0.0415550574, 0.0556300797, -0.2039769589, 1.0569715142]));
  } else if (space === 'xyz-d65') {
    [red, green, blue] = linearRgbToSrgb(matrix([c0, c1, c2], [3.2409699419, -1.5373831776, -0.4986107603, -0.9692436363, 1.8759675015, 0.0415550574, 0.0556300797, -0.2039769589, 1.0569715142]));
  } else if (space === 'xyz-d50') {
    [red, green, blue] = linearRgbToSrgb(matrix(d50ToD65([c0, c1, c2]), [3.2409699419, -1.5373831776, -0.4986107603, -0.9692436363, 1.8759675015, 0.0415550574, 0.0556300797, -0.2039769589, 1.0569715142]));
  } else if (space === 'display-p3' || space === 'display-p3-linear') {
    const linear = space === 'display-p3' ? [srgbToLinear(c0), srgbToLinear(c1), srgbToLinear(c2)] as [number, number, number] : [c0, c1, c2] as [number, number, number];
    [red, green, blue] = linearRgbToSrgb(matrix(matrix(linear, [0.4865709486, 0.2656676932, 0.1982172852, 0.2289745641, 0.6917385218, 0.0792869141, 0, 0.0451133819, 1.0439443689]), [3.2409699419, -1.5373831776, -0.4986107603, -0.9692436363, 1.8759675015, 0.0415550574, 0.0556300797, -0.2039769589, 1.0569715142]));
  }
  return `rgba(${channel(red)}, ${channel(green)}, ${channel(blue)}, ${clamp(alpha)})`;
}

function hsl(hue: number, saturation: number, lightness: number): [number, number, number] {
  const h = ((hue % 360) + 360) % 360 / 360;
  const s = clamp(saturation); const l = clamp(lightness);
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hueChannel(p, q, h + 1 / 3), hueChannel(p, q, h), hueChannel(p, q, h - 1 / 3)];
}
function hueChannel(p: number, q: number, value: number): number { let h = value; if (h < 0) h += 1; if (h > 1) h -= 1; if (h < 1 / 6) return p + (q - p) * 6 * h; if (h < 0.5) return q; if (h < 2 / 3) return p + (q - p) * (2 / 3 - h) * 6; return p; }
function hwb(hue: number, white: number, black: number): [number, number, number] { const w = clamp(white); const b = clamp(black); if (w + b >= 1) { const g = w / (w + b); return [g, g, g]; } const base = hsl(hue, 1, 0.5); const scale = 1 - w - b; return base.map((v) => v * scale + w) as [number, number, number]; }
function linearToSrgb(value: number): number { const sign = value < 0 ? -1 : 1; const magnitude = Math.abs(value); return sign * (magnitude <= 0.0031308 ? magnitude * 12.92 : 1.055 * Math.pow(magnitude, 1 / 2.4) - 0.055); }
function srgbToLinear(value: number): number { const magnitude = Math.abs(value); const linear = magnitude <= 0.04045 ? magnitude / 12.92 : Math.pow((magnitude + 0.055) / 1.055, 2.4); return value < 0 ? -linear : linear; }
function linearRgbToSrgb(value: [number, number, number]): [number, number, number] { return value.map(linearToSrgb) as [number, number, number]; }
function matrix(value: [number, number, number], m: number[]): [number, number, number] { return [m[0] * value[0] + m[1] * value[1] + m[2] * value[2], m[3] * value[0] + m[4] * value[1] + m[5] * value[2], m[6] * value[0] + m[7] * value[1] + m[8] * value[2]]; }
function labToXyz(lightness: number, a: number, b: number): [number, number, number] { const f1 = (lightness + 16) / 116; const f0 = f1 + a / 500; const f2 = f1 - b / 200; return [labInverse(f0) * 0.96422, labInverse(f1), labInverse(f2) * 0.82521]; }
function labInverse(value: number): number { const delta = 6 / 29; return value > delta ? value * value * value : 3 * delta * delta * (value - 4 / 29); }
function d50ToD65(value: [number, number, number]): [number, number, number] { return matrix(value, [0.9554734215, -0.0230984549, 0.0632592432, -0.0283697093, 1.0099953981, 0.0210414412, 0.0123140149, -0.0205076493, 1.3303659262]); }
function oklabToLinear(lightness: number, a: number, b: number): [number, number, number] { const l = lightness + 0.3963377774 * a + 0.2158037573 * b; const m = lightness - 0.1055613458 * a - 0.0638541728 * b; const s = lightness - 0.0894841775 * a - 1.2914855480 * b; const l3 = l ** 3; const m3 = m ** 3; const s3 = s ** 3; return [4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3, -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3, -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3]; }

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
