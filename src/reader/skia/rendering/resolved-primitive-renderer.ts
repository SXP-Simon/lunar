import {
  BlurStyle, ClipOp, FillType, PaintStyle, Skia, StrokeCap,
  type SkCanvas, type SkParagraph, type SkPath,
} from '@shopify/react-native-skia';

import type {
  ReaderColor, ReaderResolvedColor, ReaderResolvedPathOp,
  ReaderResolvedPrimitive, ReaderResolvedPrimitiveList,
  ReaderResolvedRect, ReaderResolvedTextPrimitive,
} from '../../contracts';
import type { SkiaDisplayListRenderOptions } from './display-list-renderer';
import { skiaColor } from './color-adapter';
import { effectiveTextColor, isBookOwnedPageGround, isOpaqueColor } from './color-override';
import { SINGLE_LINE_LAYOUT_WIDTH } from '../text/paragraph-factory';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export function renderResolvedPrimitives(
  canvas: SkCanvas,
  list: ReaderResolvedPrimitiveList,
  options: SkiaDisplayListRenderOptions,
): void {
  if (!Number.isFinite(list.ratio) || list.ratio <= 0) throw new Error('Invalid Rito render ratio.');
  if (Math.abs(list.ratio - options.pixelRatio) > 0.001) throw new Error('Rito render ratio differs from the Skia surface.');
  let alpha = 1;
  let pageGround: ReaderColor | undefined;
  const alphaStack = [alpha];
  const blockGrounds: { rect: ReaderResolvedRect; color: ReaderColor }[] = [];
  const groundStackSizes: number[] = [];
  const paragraphs = new Map<string, SkParagraph>();
  canvas.save();
  try {
    for (const command of list.commands) {
      switch (command.kind) {
        case 'push-state':
          canvas.save(); alphaStack.push(alpha); groundStackSizes.push(blockGrounds.length); break;
        case 'pop-state':
          if (alphaStack.length <= 1) throw new Error('Rito primitive state is unbalanced.');
          canvas.restore(); alphaStack.pop(); alpha = alphaStack.at(-1)!;
          blockGrounds.length = groundStackSizes.pop()!;
          break;
        case 'translate':
          canvas.translate(command.dx, command.dy); break;
        case 'opacity':
          alpha *= command.value; alphaStack[alphaStack.length - 1] = alpha; break;
        case 'transform':
          canvas.translate(command.origin.x, command.origin.y);
          for (const transform of command.transforms) {
            if (transform.kind === 'rotate') canvas.rotate(transform.radians * 180 / Math.PI, 0, 0);
            else if (transform.kind === 'scale') canvas.scale(transform.sx, transform.sy);
            else canvas.translate(transform.dx, transform.dy);
          }
          canvas.translate(-command.origin.x, -command.origin.y);
          break;
        case 'clip-path': {
          const path = makePath(command.path);
          canvas.clipPath(path, ClipOp.Intersect, true);
          path.dispose();
          break;
        }
        case 'fill-rect':
        case 'fill-path': {
          const original = color(command.color);
          const resolved = command.ground === 'page' && options.colorOverride && !isBookOwnedPageGround(original)
            ? options.colorOverride.backgroundColor : original;
          if (command.ground === 'page') {
            blockGrounds.length = 0;
            pageGround = resolved === original && isOpaqueColor(original) ? original : undefined;
          }
          if (command.ground === 'block' && command.groundRect && isOpaqueColor(original)) {
            blockGrounds.push({ rect: command.groundRect, color: original });
          }
          const paint = makePaint(resolved, alpha);
          if (command.kind === 'fill-rect') canvas.drawRect(rect(command.rect), paint);
          else {
            const path = makePath(command.path);
            path.setFillType(command.rule === 'evenodd' ? FillType.EvenOdd : FillType.Winding);
            canvas.drawPath(path, paint);
            path.dispose();
          }
          paint.dispose();
          break;
        }
        case 'stroke-path': {
          const path = makePath(command.path);
          const paint = makePaint(color(command.color), alpha);
          paint.setStyle(PaintStyle.Stroke);
          paint.setStrokeWidth(command.width);
          paint.setStrokeCap(command.cap === 'round' ? StrokeCap.Round : StrokeCap.Butt);
          const effect = command.dash ? Skia.PathEffect.MakeDash([command.dash.on, command.dash.off]) : undefined;
          if (effect) paint.setPathEffect(effect);
          canvas.drawPath(path, paint);
          effect?.dispose(); paint.dispose(); path.dispose();
          break;
        }
        case 'shadow': {
          const path = makePath(command.shape);
          const paint = makePaint(color(command.color), alpha);
          const filter = command.sigma > 0 ? Skia.MaskFilter.MakeBlur(BlurStyle.Normal, command.sigma, true) : undefined;
          if (filter) paint.setMaskFilter(filter);
          canvas.save();
          if (command.clipOut) {
            const clip = makePath(command.clipOut);
            canvas.clipPath(clip, ClipOp.Difference, true);
            clip.dispose();
          }
          canvas.translate(command.offset.x, command.offset.y);
          canvas.drawPath(path, paint);
          canvas.restore();
          filter?.dispose(); paint.dispose(); path.dispose();
          break;
        }
        case 'draw-image':
          drawImage(canvas, command, options, alpha);
          break;
        case 'text':
        case 'ruby':
          drawText(canvas, command, list.ratio, options, alpha, paragraphs, pageGround, blockGrounds);
          break;
        default:
          assertNever(command);
      }
    }
    if (alphaStack.length !== 1) throw new Error('Rito primitive state is unbalanced.');
  } finally {
    while (alphaStack.length > 1) { canvas.restore(); alphaStack.pop(); }
    canvas.restore();
    for (const paragraph of paragraphs.values()) paragraph.dispose();
  }
}

function drawImage(
  canvas: SkCanvas,
  command: Extract<ReaderResolvedPrimitive, { kind: 'draw-image' }>,
  options: SkiaDisplayListRenderOptions,
  alpha: number,
): void {
  const asset = options.images.resolveImage(command.src);
  if (!asset) return;
  const paint = makePaint('#fff', alpha);
  const source = command.sourceRect ?? { x: 0, y: 0, width: asset.width, height: asset.height };
  if (!command.tiles) canvas.drawImageRect(asset.image, rect(source), rect(command.dest), paint);
  else {
    const tiles = command.tiles;
    for (let row = 0; row < tiles.rows; row += 1) {
      for (let column = 0; column < tiles.columns; column += 1) {
        canvas.drawImageRect(asset.image, rect(source), rect({
          ...command.dest,
          x: tiles.origin.x + column * tiles.stepX,
          y: tiles.origin.y + row * tiles.stepY,
        }), paint);
      }
    }
  }
  paint.dispose();
}

function drawText(
  canvas: SkCanvas,
  command: ReaderResolvedTextPrimitive,
  ratio: number,
  options: SkiaDisplayListRenderOptions,
  alpha: number,
  paragraphs: Map<string, SkParagraph>,
  pageGround?: ReaderColor,
  blockGrounds: readonly { rect: ReaderResolvedRect; color: ReaderColor }[] = [],
): void {
  const paint = {
    font: command.paint.font,
    textShadow: command.paint.textShadows.map((shadow) => ({ ...shadow, color: color(shadow.color) })),
  };
  const ground = [...blockGrounds].reverse().find((entry) => contains(entry.rect, command.rect, ratio))?.color ?? pageGround;
  const ink = effectiveTextColor(color(command.paint.color), options.colorOverride, ground);
  const bytes = encoder.encode(command.text);
  const clusters = command.clusters.length > 0 ? command.clusters : [{ byte: 0, x: command.rect.x, y: command.rect.y + command.paint.font.sizePx * 0.8 }];
  const styleKey = JSON.stringify([paint.font, ink, alpha, paint.textShadow, command.lineHeightPx]);
  canvas.save();
  canvas.scale(ratio, ratio);
  try {
    for (let index = 0; index < clusters.length; index += 1) {
      const current = clusters[index]!;
      const next = clusters[index + 1];
      const text = decoder.decode(bytes.subarray(current.byte, next?.byte ?? bytes.length));
      if (!text) continue;
      const key = JSON.stringify([styleKey, text]);
      let paragraph = paragraphs.get(key);
      if (!paragraph) {
        paragraph = options.paragraphs.createParagraph(text, paint, {
          color: ink,
          alpha,
          textShadow: paint.textShadow,
          lineHeightPx: command.lineHeightPx,
        });
        paragraph.layout(SINGLE_LINE_LAYOUT_WIDTH);
        paragraphs.set(key, paragraph);
      }
      const baseline = paragraph.getLineMetrics()[0]?.baseline ?? command.paint.font.sizePx * 0.8;
      paragraph.paint(canvas, current.x, current.y - baseline);
    }
  } finally {
    canvas.restore();
  }
}

function makePath(ops: readonly ReaderResolvedPathOp[]): SkPath {
  const path = Skia.Path.Make();
  for (const op of ops) {
    switch (op.op) {
      case 'move-to': path.moveTo(op.x, op.y); break;
      case 'line-to': path.lineTo(op.x, op.y); break;
      case 'arc': path.arcToOval(Skia.XYWHRect(op.cx - op.rx, op.cy - op.ry, op.rx * 2, op.ry * 2), op.start * 180 / Math.PI, op.sweep * 180 / Math.PI, false); break;
      case 'ellipse': path.addOval(Skia.XYWHRect(op.cx - op.rx, op.cy - op.ry, op.rx * 2, op.ry * 2)); break;
      case 'rect': path.addRect(rect(op)); break;
      case 'close': path.close(); break;
      default: assertNever(op);
    }
  }
  return path;
}

function color(value: ReaderResolvedColor): ReaderColor {
  return { space: value.space, components: [value.component0, value.component1, value.component2], alpha: value.alpha, none: value.none };
}

function contains(outer: ReaderResolvedRect, inner: ReaderResolvedRect, ratio: number): boolean {
  return inner.x * ratio >= outer.x && inner.y * ratio >= outer.y
    && (inner.x + inner.width) * ratio <= outer.x + outer.width
    && (inner.y + inner.height) * ratio <= outer.y + outer.height;
}

function makePaint(value: ReaderColor | string, alpha: number) {
  const paint = Skia.Paint();
  const resolved = skiaColor(value);
  paint.setAntiAlias(true);
  paint.setColor(resolved);
  paint.setAlphaf(Math.max(0, Math.min(1, alpha * (resolved[3] ?? 1))));
  return paint;
}

function rect(value: ReaderResolvedRect) {
  return Skia.XYWHRect(value.x, value.y, value.width, value.height);
}

function assertNever(value: never): never {
  throw new Error(`Unknown Rito primitive: ${String(value)}`);
}
