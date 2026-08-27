import { Skia } from '@shopify/react-native-skia';

import type { ReaderColor, ReaderColorSpace } from '../../contracts';

export function skiaColor(value: ReaderColor | string): ReturnType<typeof Skia.Color> {
  if (typeof value === 'string') {
    try { return Skia.Color(value); } catch { return Skia.Color('transparent'); }
  }
  const [r, g, b] = toSrgb(value.space,
    value.none.component0 ? 0 : value.components[0],
    value.none.component1 ? 0 : value.components[1],
    value.none.component2 ? 0 : value.components[2]);
  return new Float32Array([clamp(r), clamp(g), clamp(b), value.none.alpha ? 0 : clamp(value.alpha)]);
}

function toSrgb(space: ReaderColorSpace, c0: number, c1: number, c2: number): [number, number, number] {
  if (space === 'srgb') return [c0, c1, c2];
  if (space === 'hsl') return hsl(c0, c1 / 100, c2 / 100);
  if (space === 'hwb') return hwb(c0, c1 / 100, c2 / 100);
  if (space === 'srgb-linear') return [linearToSrgb(c0), linearToSrgb(c1), linearToSrgb(c2)];
  if (space === 'oklab' || space === 'oklch') {
    const angle = space === 'oklch' ? c2 * Math.PI / 180 : 0;
    return linearRgbToSrgb(oklabToLinear(c0, space === 'oklch' ? c1 * Math.cos(angle) : c1, space === 'oklch' ? c1 * Math.sin(angle) : c2));
  }
  if (space === 'lab' || space === 'lch') {
    const angle = space === 'lch' ? c2 * Math.PI / 180 : 0;
    const xyz = labToXyz(c0, space === 'lch' ? c1 * Math.cos(angle) : c1, space === 'lch' ? c1 * Math.sin(angle) : c2);
    return linearRgbToSrgb(matrix(d50ToD65(xyz), [3.2409699419, -1.5373831776, -0.4986107603, -0.9692436363, 1.8759675015, 0.0415550574, 0.0556300797, -0.2039769589, 1.0569715142]));
  }
  if (space === 'xyz-d65') return linearRgbToSrgb(matrix([c0, c1, c2], [3.2409699419, -1.5373831776, -0.4986107603, -0.9692436363, 1.8759675015, 0.0415550574, 0.0556300797, -0.2039769589, 1.0569715142]));
  if (space === 'xyz-d50') return linearRgbToSrgb(matrix(d50ToD65([c0, c1, c2]), [3.2409699419, -1.5373831776, -0.4986107603, -0.9692436363, 1.8759675015, 0.0415550574, 0.0556300797, -0.2039769589, 1.0569715142]));
  if (space === 'display-p3' || space === 'display-p3-linear') {
    const linear = space === 'display-p3' ? [srgbToLinear(c0), srgbToLinear(c1), srgbToLinear(c2)] as [number, number, number] : [c0, c1, c2] as [number, number, number];
    return linearRgbToSrgb(matrix(matrix(linear, [0.4865709486, 0.2656676932, 0.1982172852, 0.2289745641, 0.6917385218, 0.0792869141, 0, 0.0451133819, 1.0439443689]), [3.2409699419, -1.5373831776, -0.4986107603, -0.9692436363, 1.8759675015, 0.0415550574, 0.0556300797, -0.2039769589, 1.0569715142]));
  }
  return [c0, c1, c2];
}

function hsl(hue: number, saturation: number, lightness: number): [number, number, number] {
  const h = ((hue % 360) + 360) % 360 / 360;
  const s = clamp(saturation); const l = clamp(lightness);
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hueChannel(p, q, h + 1 / 3), hueChannel(p, q, h), hueChannel(p, q, h - 1 / 3)];
}

function hwb(hue: number, white: number, black: number): [number, number, number] {
  const w = clamp(white); const b = clamp(black);
  if (w + b >= 1) { const gray = w / (w + b); return [gray, gray, gray]; }
  const base = hsl(hue, 1, 0.5); const scale = 1 - w - b;
  return [base[0] * scale + w, base[1] * scale + w, base[2] * scale + w];
}

function hueChannel(p: number, q: number, value: number): number {
  let h = value; if (h < 0) h += 1; if (h > 1) h -= 1;
  if (h < 1 / 6) return p + (q - p) * 6 * h;
  if (h < 0.5) return q;
  if (h < 2 / 3) return p + (q - p) * (2 / 3 - h) * 6;
  return p;
}

function linearToSrgb(value: number): number {
  const magnitude = Math.abs(value);
  const encoded = magnitude <= 0.0031308 ? magnitude * 12.92 : 1.055 * Math.pow(magnitude, 1 / 2.4) - 0.055;
  return value < 0 ? -encoded : encoded;
}

function srgbToLinear(value: number): number { const m = Math.abs(value); const l = m <= 0.04045 ? m / 12.92 : Math.pow((m + 0.055) / 1.055, 2.4); return value < 0 ? -l : l; }
function linearRgbToSrgb(value: [number, number, number]): [number, number, number] { return [linearToSrgb(value[0]), linearToSrgb(value[1]), linearToSrgb(value[2])]; }
function matrix(v: [number, number, number], m: number[]): [number, number, number] { return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; }
function labToXyz(l: number, a: number, b: number): [number, number, number] { const f1 = (l + 16) / 116; return [labInv(f1 + a / 500) * 0.96422, labInv(f1), labInv(f1 - b / 200) * 0.82521]; }
function labInv(v: number): number { const d = 6 / 29; return v > d ? v * v * v : 3 * d * d * (v - 4 / 29); }
function d50ToD65(v: [number, number, number]): [number, number, number] { return matrix(v, [0.9554734215, -0.0230984549, 0.0632592432, -0.0283697093, 1.0099953981, 0.0210414412, 0.0123140149, -0.0205076493, 1.3303659262]); }
function oklabToLinear(l: number, a: number, b: number): [number, number, number] { const ll = l + 0.3963377774 * a + 0.2158037573 * b; const mm = l - 0.1055613458 * a - 0.0638541728 * b; const ss = l - 0.0894841775 * a - 1.2914855480 * b; const l3 = ll ** 3, m3 = mm ** 3, s3 = ss ** 3; return [4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3, -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3, -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3]; }

function clamp(value: number): number { return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0)); }
