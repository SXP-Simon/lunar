import {
  BlurStyle,
  ClipOp,
  PaintStyle,
  Skia,
  StrokeCap,
  type SkCanvas,
  type SkPaint,
  type SkRect,
} from '@shopify/react-native-skia';

import type {
  ReaderBlockPaint,
  ReaderBorderPaintEdge,
  ReaderDisplayList,
  ReaderDrawCommand,
  ReaderLength,
  ReaderRect,
  ReaderRunBorderEdge,
  ReaderRunPaint,
} from '../../contracts';
import type { SkiaImageAsset } from '../images/image-decoder';
import {
  SINGLE_LINE_LAYOUT_WIDTH,
  type SkiaParagraphFactory,
} from '../text/paragraph-factory';

export interface SkiaDisplayListRenderOptions {
  readonly pixelRatio: number;
  readonly images: {
    resolveImage(source: string): SkiaImageAsset | undefined;
  };
  readonly paragraphs: SkiaParagraphFactory;
}

export interface LunarSkiaDisplayListRenderer {
  render(
    displayList: ReaderDisplayList,
    canvas: SkCanvas,
    options?: SkiaDisplayListRenderOptions,
  ): void;
}

export interface SkiaDisplayListCompiler {
  render(
    displayList: ReaderDisplayList,
    canvas: SkCanvas,
    options: SkiaDisplayListRenderOptions,
  ): void;
}

export class SkiaDisplayListRenderer
  implements LunarSkiaDisplayListRenderer, SkiaDisplayListCompiler
{
  render(
    displayList: ReaderDisplayList,
    canvas: SkCanvas,
    options?: SkiaDisplayListRenderOptions,
  ): void {
    if (!options) {
      throw new Error('Skia display-list rendering requires image and text resources.');
    }

    const state: RenderState = { alpha: 1, alphaStack: [1], options };
    canvas.save();
    canvas.scale(options.pixelRatio, options.pixelRatio);
    try {
      for (const command of displayList.commands) {
        renderCommand(canvas, command, state);
      }
    } finally {
      canvas.restore();
    }
  }
}

interface RenderState {
  alpha: number;
  readonly alphaStack: number[];
  readonly options: SkiaDisplayListRenderOptions;
}

function renderCommand(
  canvas: SkCanvas,
  command: ReaderDrawCommand,
  state: RenderState,
): void {
  switch (command.kind) {
    case 'pushState':
      canvas.save();
      state.alphaStack.push(state.alpha);
      return;
    case 'popState':
      if (state.alphaStack.length > 1) {
        canvas.restore();
        state.alphaStack.pop();
        state.alpha = state.alphaStack.at(-1) ?? 1;
      }
      return;
    case 'translate':
      canvas.translate(command.dx, command.dy);
      return;
    case 'transform':
      applyTransform(canvas, command);
      return;
    case 'opacity':
      state.alpha = clampAlpha(state.alpha * command.value);
      state.alphaStack[state.alphaStack.length - 1] = state.alpha;
      return;
    case 'clipRect': {
      const rect = toSkRect(command.rect);
      if (command.radius && (command.radius.rx > 0 || command.radius.ry > 0)) {
        canvas.clipRRect(
          Skia.RRectXY(rect, command.radius.rx, command.radius.ry),
          ClipOp.Intersect,
          true,
        );
      } else {
        canvas.clipRect(rect, ClipOp.Intersect, true);
      }
      return;
    }
    case 'paintPage':
      if (command.paint.backgroundColor) {
        drawFilledRect(canvas, command.rect, command.paint.backgroundColor, state.alpha);
      }
      return;
    case 'paintBlock':
      drawBlock(canvas, command.rect, command.paint, command.borderBox, state);
      return;
    case 'paintText':
      drawText(canvas, command.text, command.rect, command.paint, state);
      return;
    case 'paintRuby':
      drawRuby(canvas, command.text, command.rect, command.paint, state);
      return;
    case 'paintImage':
      drawImage(canvas, command.src, command.rect, state, command.sourceRect);
      return;
    case 'paintHorizontalRule':
      drawHorizontalRule(canvas, command.rect, command.paint, state.alpha);
      return;
    default:
      return assertNever(command);
  }
}

function drawBlock(
  canvas: SkCanvas,
  rect: ReaderRect,
  paint: ReaderBlockPaint,
  borderBox: { topWidth: number; rightWidth: number; bottomWidth: number; leftWidth: number } | undefined,
  state: RenderState,
): void {
  const radius = resolveRadius(paint, rect);
  for (const shadow of paint.boxShadow ?? []) {
    if (shadow.inset) {
      continue;
    }
    const shadowPaint = createPaint(shadow.color, state.alpha);
    const filter = shadow.blur > 0
      ? Skia.MaskFilter.MakeBlur(BlurStyle.Normal, Math.max(0.01, shadow.blur / 2), true)
      : undefined;
    if (filter) {
      shadowPaint.setMaskFilter(filter);
    }
    const spreadRect = Skia.XYWHRect(
      rect.x + shadow.offsetX - shadow.spread,
      rect.y + shadow.offsetY - shadow.spread,
      rect.width + shadow.spread * 2,
      rect.height + shadow.spread * 2,
    );
    canvas.drawRRect(
      Skia.RRectXY(spreadRect, radius.rx + shadow.spread, radius.ry + shadow.spread),
      shadowPaint,
    );
    filter?.dispose();
    shadowPaint.dispose();
  }

  if (paint.background?.color) {
    drawFilledRect(canvas, rect, paint.background.color, state.alpha, radius);
  }
  if (paint.background?.image) {
    drawBackgroundImage(canvas, rect, paint, radius, state);
  }
  if (borderBox && paint.border) {
    drawBlockBorders(canvas, rect, borderBox, paint.border, state.alpha);
  }
}

function drawBackgroundImage(
  canvas: SkCanvas,
  rect: ReaderRect,
  paint: ReaderBlockPaint,
  radius: { rx: number; ry: number },
  state: RenderState,
): void {
  const background = paint.background;
  if (!background?.image) {
    return;
  }
  const asset = state.options.images.resolveImage(background.image);
  if (!asset) {
    return;
  }

  const scale = background.size === 'cover'
    ? Math.max(rect.width / asset.width, rect.height / asset.height)
    : background.size === 'contain'
      ? Math.min(rect.width / asset.width, rect.height / asset.height)
      : 1;
  const width = asset.width * scale;
  const height = asset.height * scale;
  const x = rect.x + resolveBackgroundOffset(background.position?.x, rect.width - width, background.size);
  const y = rect.y + resolveBackgroundOffset(background.position?.y, rect.height - height, background.size);

  canvas.save();
  canvas.clipRRect(Skia.RRectXY(toSkRect(rect), radius.rx, radius.ry), ClipOp.Intersect, true);
  const imagePaint = createPaint('#FFFFFF', state.alpha);
  const sourceRect = Skia.XYWHRect(0, 0, asset.width, asset.height);
  const xLimit = background.repeat === 'repeat' ? rect.x + rect.width : x + width;
  const yLimit = background.repeat === 'repeat' ? rect.y + rect.height : y + height;
  for (let tileY = y; tileY < yLimit; tileY += Math.max(1, height)) {
    for (let tileX = x; tileX < xLimit; tileX += Math.max(1, width)) {
      canvas.drawImageRect(
        asset.image,
        sourceRect,
        Skia.XYWHRect(tileX, tileY, width, height),
        imagePaint,
      );
    }
  }
  imagePaint.dispose();
  canvas.restore();
}

function drawBlockBorders(
  canvas: SkCanvas,
  rect: ReaderRect,
  widths: { topWidth: number; rightWidth: number; bottomWidth: number; leftWidth: number },
  borders: NonNullable<ReaderBlockPaint['border']>,
  alpha: number,
): void {
  if (borders.top && widths.topWidth > 0) {
    drawBorderLine(canvas, borders.top, widths.topWidth, rect.x, rect.y + widths.topWidth / 2, rect.x + rect.width, rect.y + widths.topWidth / 2, alpha);
  }
  if (borders.right && widths.rightWidth > 0) {
    drawBorderLine(canvas, borders.right, widths.rightWidth, rect.x + rect.width - widths.rightWidth / 2, rect.y, rect.x + rect.width - widths.rightWidth / 2, rect.y + rect.height, alpha);
  }
  if (borders.bottom && widths.bottomWidth > 0) {
    drawBorderLine(canvas, borders.bottom, widths.bottomWidth, rect.x, rect.y + rect.height - widths.bottomWidth / 2, rect.x + rect.width, rect.y + rect.height - widths.bottomWidth / 2, alpha);
  }
  if (borders.left && widths.leftWidth > 0) {
    drawBorderLine(canvas, borders.left, widths.leftWidth, rect.x + widths.leftWidth / 2, rect.y, rect.x + widths.leftWidth / 2, rect.y + rect.height, alpha);
  }
}

function drawText(
  canvas: SkCanvas,
  text: string,
  rect: ReaderRect,
  paint: ReaderRunPaint,
  state: RenderState,
): void {
  drawInlineBox(canvas, rect, paint, state.alpha);
  const paragraph = state.options.paragraphs.createParagraph(text, paint, {
    color: paint.color,
    alpha: state.alpha,
    textShadow: paint.textShadow,
  });
  try {
    paragraph.layout(SINGLE_LINE_LAYOUT_WIDTH);
    paragraph.paint(canvas, rect.x, rect.y);
  } finally {
    paragraph.dispose();
  }

  if (paint.decoration) {
    const y = rect.y + paint.decoration.y;
    drawSolidLine(
      canvas,
      rect.x,
      y,
      rect.x + rect.width,
      y,
      paint.decoration.color,
      paint.decoration.thickness,
      state.alpha,
    );
  }
}

function drawRuby(
  canvas: SkCanvas,
  text: string,
  rect: ReaderRect,
  paint: ReaderRunPaint,
  state: RenderState,
): void {
  const measured = state.options.paragraphs.measureShapedText(text, paint).width;
  drawText(
    canvas,
    text,
    { ...rect, x: rect.x + Math.max(0, (rect.width - measured) / 2), width: measured },
    { ...paint, backgroundColor: undefined, border: undefined, padding: undefined },
    state,
  );
}

function drawInlineBox(
  canvas: SkCanvas,
  rect: ReaderRect,
  paint: ReaderRunPaint,
  alpha: number,
): void {
  const box = computeInlineBox(rect, paint);
  if (paint.backgroundColor) {
    drawFilledRect(
      canvas,
      box,
      paint.backgroundColor,
      alpha,
      { rx: paint.backgroundRadius ?? 0, ry: paint.backgroundRadius ?? 0 },
    );
  }
  const border = paint.border;
  if (!border) {
    return;
  }
  drawRunBorder(canvas, border.top, box.x, box.y, box.x + box.width, box.y, alpha);
  drawRunBorder(canvas, border.bottom, box.x, box.y + box.height, box.x + box.width, box.y + box.height, alpha);
  drawRunBorder(canvas, border.start, box.x, box.y, box.x, box.y + box.height, alpha);
  drawRunBorder(canvas, border.end, box.x + box.width, box.y, box.x + box.width, box.y + box.height, alpha);
}

function computeInlineBox(rect: ReaderRect, paint: ReaderRunPaint): ReaderRect {
  const padding = paint.padding;
  const border = paint.border;
  const left = (padding?.left ?? 0) + (border?.start?.widthPx ?? 0);
  const right = (padding?.right ?? 0) + (border?.end?.widthPx ?? 0);
  const top = (padding?.top ?? 0) + (border?.top?.widthPx ?? 0);
  const bottom = (padding?.bottom ?? 0) + (border?.bottom?.widthPx ?? 0);
  return {
    x: rect.x - left,
    y: rect.y - top,
    width: rect.width + left + right,
    height: paint.font.sizePx + top + bottom,
  };
}

function drawRunBorder(
  canvas: SkCanvas,
  edge: ReaderRunBorderEdge | undefined,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  alpha: number,
): void {
  if (edge && edge.widthPx > 0) {
    drawBorderLine(canvas, edge.paint, edge.widthPx, x1, y1, x2, y2, alpha);
  }
}

function drawImage(
  canvas: SkCanvas,
  source: string,
  rect: ReaderRect,
  state: RenderState,
  sourceRect?: ReaderRect,
): void {
  const asset = state.options.images.resolveImage(source);
  if (!asset) {
    return;
  }
  const paint = createPaint('#FFFFFF', state.alpha);
  canvas.drawImageRect(
    asset.image,
    sourceRect
      ? Skia.XYWHRect(sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height)
      : Skia.XYWHRect(0, 0, asset.width, asset.height),
    toSkRect(rect),
    paint,
  );
  paint.dispose();
}

function drawHorizontalRule(
  canvas: SkCanvas,
  rect: ReaderRect,
  paint: { color: string; style: 'solid' | 'dotted' | 'dashed' },
  alpha: number,
): void {
  const width = paint.style === 'dotted' ? rect.height * 0.75 : rect.height;
  const y = Math.round(rect.y + rect.height / 2) + (rect.height % 2 === 1 ? 0.5 : 0);
  drawBorderLine(
    canvas,
    paint,
    width,
    Math.round(rect.x),
    y,
    Math.round(rect.x + rect.width),
    y,
    alpha,
  );
}

function drawBorderLine(
  canvas: SkCanvas,
  edge: ReaderBorderPaintEdge,
  width: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  alpha: number,
): void {
  const paint = createPaint(edge.color, alpha, PaintStyle.Stroke);
  paint.setStrokeWidth(width);
  let effect: ReturnType<typeof Skia.PathEffect.MakeDash> | undefined;
  if (edge.style === 'dotted') {
    effect = Skia.PathEffect.MakeDash([0.001, Math.max(1, width * 1.5)]);
    paint.setStrokeCap(StrokeCap.Round);
  } else if (edge.style === 'dashed') {
    effect = Skia.PathEffect.MakeDash([Math.max(1, width * 3), Math.max(1, width * 2)]);
  }
  if (effect) {
    paint.setPathEffect(effect);
  }
  canvas.drawLine(x1, y1, x2, y2, paint);
  effect?.dispose();
  paint.dispose();
}

function drawSolidLine(
  canvas: SkCanvas,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width: number,
  alpha: number,
): void {
  const paint = createPaint(color, alpha, PaintStyle.Stroke);
  paint.setStrokeWidth(width);
  canvas.drawLine(x1, y1, x2, y2, paint);
  paint.dispose();
}

function drawFilledRect(
  canvas: SkCanvas,
  rect: ReaderRect,
  color: string,
  alpha: number,
  radius = { rx: 0, ry: 0 },
): void {
  const paint = createPaint(color, alpha);
  if (radius.rx > 0 || radius.ry > 0) {
    canvas.drawRRect(Skia.RRectXY(toSkRect(rect), radius.rx, radius.ry), paint);
  } else {
    canvas.drawRect(toSkRect(rect), paint);
  }
  paint.dispose();
}

function createPaint(
  color: string,
  alpha: number,
  style = PaintStyle.Fill,
): SkPaint {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setStyle(style);
  paint.setColor(toColor(color));
  paint.setAlphaf(clampAlpha(alpha));
  return paint;
}

function resolveRadius(
  paint: ReaderBlockPaint,
  rect: ReaderRect,
): { rx: number; ry: number } {
  if (paint.radius?.pct !== undefined) {
    return {
      rx: (paint.radius.pct / 100) * rect.width,
      ry: (paint.radius.pct / 100) * rect.height,
    };
  }
  const radius = paint.radius?.px ?? 0;
  return { rx: radius, ry: radius };
}

function resolveBackgroundOffset(
  value: ReaderLength | undefined,
  available: number,
  size: 'cover' | 'contain' | 'auto' | undefined,
): number {
  if (!value) {
    return size === 'auto' ? 0 : available / 2;
  }
  return value.unit === 'percent' ? (value.value / 100) * available : value.value;
}

function applyTransform(
  canvas: SkCanvas,
  command: Extract<ReaderDrawCommand, { kind: 'transform' }>,
): void {
  canvas.translate(command.origin.x, command.origin.y);
  for (const transform of command.transforms) {
    switch (transform.kind) {
      case 'rotate':
        canvas.rotate((transform.rad * 180) / Math.PI, 0, 0);
        break;
      case 'scale':
        canvas.scale(transform.sx, transform.sy);
        break;
      case 'translate':
        canvas.translate(
          resolveLength(transform.x, command.box.width),
          resolveLength(transform.y, command.box.height),
        );
        break;
    }
  }
  canvas.translate(-command.origin.x, -command.origin.y);
}

function resolveLength(value: ReaderLength, basis: number): number {
  return value.unit === 'percent' ? (value.value / 100) * basis : value.value;
}

function toSkRect(rect: ReaderRect): SkRect {
  return Skia.XYWHRect(rect.x, rect.y, rect.width, rect.height);
}

function toColor(value: string) {
  try {
    return Skia.Color(value);
  } catch {
    return Skia.Color('transparent');
  }
}

function clampAlpha(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 1));
}

function assertNever(value: never): never {
  throw new Error(`Unsupported Rito display-list command: ${JSON.stringify(value)}`);
}
