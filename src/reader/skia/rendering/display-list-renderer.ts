import {
  BlurStyle,
  ClipOp,
  FillType,
  PaintStyle,
  Skia,
  StrokeCap,
  type SkCanvas,
  type SkPaint,
  type SkRect,
} from '@shopify/react-native-skia';

import type {
  ReaderBlockPaint,
  ReaderColor,
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
import { skiaColor } from './color-adapter';
import {
  declaredGroundFor,
  effectiveTextColor,
  isBookOwnedPageGround,
  isOpaqueColor,
  type DeclaredGround,
  type SkiaColorOverride,
} from './color-override';

export interface SkiaDisplayListRenderOptions {
  readonly pixelRatio: number;
  readonly images: {
    resolveImage(source: string): SkiaImageAsset | undefined;
  };
  readonly paragraphs: SkiaParagraphFactory;
  readonly colorOverride?: SkiaColorOverride;
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

    validateDisplayList(displayList);
    const state: RenderState = { alpha: 1, alphaStack: [1], options, blockGrounds: [], groundStackSizes: [] };
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
  readonly blockGrounds: DeclaredGround[];
  readonly groundStackSizes: number[];
  pageGround?: ReaderColor | string;
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
      state.groundStackSizes.push(state.blockGrounds.length);
      return;
    case 'popState':
      if (state.alphaStack.length > 1) {
        canvas.restore();
        state.alphaStack.pop();
        state.alpha = state.alphaStack.at(-1) ?? 1;
        const groundSize = state.groundStackSizes.pop();
        if (groundSize !== undefined) state.blockGrounds.length = groundSize;
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
          Skia.RRectXY(rect, Math.min(rect.width / 2, Math.max(0, command.radius.rx)), Math.min(rect.height / 2, Math.max(0, command.radius.ry))),
          ClipOp.Intersect,
          true,
        );
      } else {
        canvas.clipRect(rect, ClipOp.Intersect, true);
      }
      return;
    }
    case 'paintPage':
      state.blockGrounds.length = 0;
      state.pageGround = undefined;
      if (command.paint.backgroundColor) {
        const original = command.paint.backgroundColor;
        const override = state.options.colorOverride;
        if (override && !isBookOwnedPageGround(original)) {
          drawFilledRect(canvas, command.rect, override.backgroundColor, state.alpha);
        } else {
          state.pageGround = original;
          drawFilledRect(canvas, command.rect, original, state.alpha);
        }
      }
      return;
    case 'paintBlock':
      drawBlock(canvas, command.rect, command.paint, command.borderBox, state);
      return;
    case 'paintText':
      if (command.vertical) drawVerticalText(canvas, command.text, command.rect, command.paint, state);
      else drawText(canvas, command.text, command.rect, command.paint, state, command.lineHeightPx);
      return;
    case 'paintRuby':
      if (command.vertical) drawVerticalText(canvas, command.text, command.rect, command.paint, state, true);
      else drawRuby(canvas, command.text, command.rect, command.paint, state, command.rubyAlign, command.lineHeightPx);
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
  if (paint.background?.color && isOpaqueColor(paint.background.color)) {
    state.blockGrounds.push({ rect, color: paint.background.color });
  }
  for (const shadow of [...(paint.boxShadow ?? [])].reverse()) {
    if (shadow.inset) { drawInsetShadow(canvas, rect, radius, shadow, state.alpha); continue; }
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
    const padding = shadow.blur * 2 + Math.abs(shadow.offsetX) + Math.abs(shadow.offsetY) + Math.max(0, shadow.spread) + 4;
    const clip = Skia.Path.Make();
    clip.setFillType(FillType.EvenOdd);
    clip.addRect(Skia.XYWHRect(rect.x - padding, rect.y - padding, rect.width + padding * 2, rect.height + padding * 2));
    clip.addRRect(toRRect(toSkRect(rect), radius));
    canvas.save();
    canvas.clipPath(clip, ClipOp.Intersect, true);
    canvas.drawRRect(toRRect(spreadRect, radius, shadow.spread), shadowPaint);
    canvas.restore();
    clip.dispose();
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
    drawBlockBorders(canvas, rect, borderBox, paint.border, state.alpha, radius);
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
  let width = asset.width * scale;
  let height = asset.height * scale;
  canvas.save();
  canvas.clipRRect(toRRect(toSkRect(rect), radius), ClipOp.Intersect, true);
  const imagePaint = createPaint('#FFFFFF', state.alpha);
  const sourceRect = Skia.XYWHRect(0, 0, asset.width, asset.height);
  const repeat = background.repeat ?? 'repeat';
  if (repeat === 'round') {
    if (rect.width > 0) width = rect.width / Math.max(1, Math.round(rect.width / Math.max(1, width)));
    if (rect.height > 0) height = rect.height / Math.max(1, Math.round(rect.height / Math.max(1, height)));
  }
  const x = rect.x + resolveBackgroundOffset(background.position?.x, rect.width - width, background.size);
  const y = rect.y + resolveBackgroundOffset(background.position?.y, rect.height - height, background.size);
  const repeatX = repeat === 'repeat' || repeat === 'repeat-x' || repeat === 'space' || repeat === 'round';
  const repeatY = repeat === 'repeat' || repeat === 'repeat-y' || repeat === 'space' || repeat === 'round';
  const columns = tilePositions(x, width, rect.x, rect.width, repeatX, repeat);
  const rows = tilePositions(y, height, rect.y, rect.height, repeatY, repeat);
  if (columns.length * rows.length > 4096) {
    imagePaint.dispose(); canvas.restore();
    throw new Error(`Skia background requires ${columns.length * rows.length} tiles; maximum is 4096.`);
  }
  for (const tileY of rows) for (const tileX of columns) {
      canvas.drawImageRect(
        asset.image,
        sourceRect,
        Skia.XYWHRect(tileX, tileY, width, height),
        imagePaint,
      );
  }
  imagePaint.dispose();
  canvas.restore();
}

function drawInsetShadow(
  canvas: SkCanvas,
  rect: ReaderRect,
  radius: ResolvedRadius,
  shadow: NonNullable<ReaderBlockPaint['boxShadow']>[number],
  alpha: number,
): void {
  const paint = createPaint(shadow.color, alpha, PaintStyle.Stroke);
  paint.setStrokeWidth(Math.max(1, shadow.spread + shadow.blur));
  const filter = shadow.blur > 0 ? Skia.MaskFilter.MakeBlur(BlurStyle.Normal, Math.max(0.01, shadow.blur / 2), true) : undefined;
  if (filter) paint.setMaskFilter(filter);
  canvas.save();
  canvas.clipRRect(toRRect(toSkRect(rect), radius), ClipOp.Intersect, true);
  canvas.drawRRect(toRRect(Skia.XYWHRect(rect.x + shadow.offsetX, rect.y + shadow.offsetY, rect.width, rect.height), radius), paint);
  canvas.restore();
  filter?.dispose();
  paint.dispose();
}

function drawBlockBorders(
  canvas: SkCanvas,
  rect: ReaderRect,
  widths: { topWidth: number; rightWidth: number; bottomWidth: number; leftWidth: number },
  borders: NonNullable<ReaderBlockPaint['border']>,
  alpha: number,
  radius: ResolvedRadius = { rx: 0, ry: 0 },
): void {
  if (radius.rx > 0 || radius.ry > 0) {
    const edges = [borders.top, borders.right, borders.bottom, borders.left];
    const widthsList = [widths.topWidth, widths.rightWidth, widths.bottomWidth, widths.leftWidth];
    const first = edges[0];
    if (first && !isDirectionalBorderStyle(first.style) && edges.every((edge) => edge?.style === first.style && edge?.color === first.color) && widthsList.every((width) => width === widthsList[0])) {
      drawStyledRoundedBorder(canvas, rect, radius, first, widthsList[0], alpha);
      return;
    }
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    const corners = [
      [{ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y }],
      [{ x: rect.x + rect.width, y: rect.y }, { x: rect.x + rect.width, y: rect.y + rect.height }],
      [{ x: rect.x + rect.width, y: rect.y + rect.height }, { x: rect.x, y: rect.y + rect.height }],
      [{ x: rect.x, y: rect.y + rect.height }, { x: rect.x, y: rect.y }],
    ] as const;
    const edgeList = [borders.top, borders.right, borders.bottom, borders.left];
    for (let index = 0; index < edgeList.length; index += 1) {
      const edge = edgeList[index]; const width = widthsList[index];
      if (!edge || width <= 0 || edge.style === 'none' || edge.style === 'hidden') continue;
      const path = Skia.Path.Make();
      path.moveTo(center.x, center.y); path.lineTo(corners[index][0].x, corners[index][0].y); path.lineTo(corners[index][1].x, corners[index][1].y); path.close();
      canvas.save(); canvas.clipPath(path, ClipOp.Intersect, true);
      drawStyledRoundedBorder(canvas, rect, radius, { ...edge, color: resolveDirectionalBorder(edge, index) }, width, alpha);
      canvas.restore(); path.dispose();
    }
    return;
  }
  if (borders.top && widths.topWidth > 0) {
    drawBorderLine(canvas, { ...borders.top, color: resolveDirectionalBorder(borders.top, 0) }, widths.topWidth, rect.x, rect.y + widths.topWidth / 2, rect.x + rect.width, rect.y + widths.topWidth / 2, alpha);
  }
  if (borders.right && widths.rightWidth > 0) {
    drawBorderLine(canvas, { ...borders.right, color: resolveDirectionalBorder(borders.right, 1) }, widths.rightWidth, rect.x + rect.width - widths.rightWidth / 2, rect.y, rect.x + rect.width - widths.rightWidth / 2, rect.y + rect.height, alpha);
  }
  if (borders.bottom && widths.bottomWidth > 0) {
    drawBorderLine(canvas, { ...borders.bottom, color: resolveDirectionalBorder(borders.bottom, 2) }, widths.bottomWidth, rect.x, rect.y + rect.height - widths.bottomWidth / 2, rect.x + rect.width, rect.y + rect.height - widths.bottomWidth / 2, alpha);
  }
  if (borders.left && widths.leftWidth > 0) {
    drawBorderLine(canvas, { ...borders.left, color: resolveDirectionalBorder(borders.left, 3) }, widths.leftWidth, rect.x + widths.leftWidth / 2, rect.y, rect.x + widths.leftWidth / 2, rect.y + rect.height, alpha);
  }
}

function drawStyledRoundedBorder(
  canvas: SkCanvas,
  rect: ReaderRect,
  radius: ResolvedRadius,
  edge: ReaderBorderPaintEdge,
  width: number,
  alpha: number,
): void {
  if (width <= 0 || edge.style === 'none' || edge.style === 'hidden') return;
  if (edge.style === 'double') {
    const third = Math.max(1, width / 3);
    drawStyledRoundedBorder(canvas, rect, radius, { ...edge, style: 'solid' }, third, alpha);
    const inset = third * 2;
    if (rect.width > inset * 2 && rect.height > inset * 2) {
      drawStyledRoundedBorder(canvas, { x: rect.x + inset, y: rect.y + inset, width: rect.width - inset * 2, height: rect.height - inset * 2 }, shrinkRadius(radius, inset), { ...edge, style: 'solid' }, third, alpha);
    }
    return;
  }
  if (edge.style === 'groove' || edge.style === 'ridge') {
    const half = Math.max(1, width / 2);
    drawStyledRoundedBorder(canvas, rect, radius, { ...edge, color: tintBorderColor(edge.color, edge.style === 'groove' ? 0.6 : 1.15), style: 'solid' }, half, alpha);
    const inset = half;
    if (rect.width > inset * 2 && rect.height > inset * 2) {
      drawStyledRoundedBorder(canvas, { x: rect.x + inset, y: rect.y + inset, width: rect.width - inset * 2, height: rect.height - inset * 2 }, shrinkRadius(radius, inset), { ...edge, color: tintBorderColor(edge.color, edge.style === 'groove' ? 1.15 : 0.6), style: 'solid' }, half, alpha);
    }
    return;
  }
  const paint = createPaint(edge.color, alpha, PaintStyle.Stroke);
  paint.setStrokeWidth(edge.style === 'dotted' ? width * 0.75 : width);
  let effect: ReturnType<typeof Skia.PathEffect.MakeDash> | undefined;
  if (edge.style === 'dotted') {
    effect = Skia.PathEffect.MakeDash([0.001, Math.max(1, width * 1.5)]);
    paint.setStrokeCap(StrokeCap.Round);
  } else if (edge.style === 'dashed') {
    effect = Skia.PathEffect.MakeDash([Math.max(1, width * 3), Math.max(1, width * 2)]);
  }
  if (effect) paint.setPathEffect(effect);
  canvas.drawRRect(toRRect(toSkRect(rect), radius), paint);
  effect?.dispose(); paint.dispose();
}

function shrinkRadius(radius: ResolvedRadius, inset: number): ResolvedRadius {
  if (!radius.corners) return { rx: Math.max(0, radius.rx - inset), ry: Math.max(0, radius.ry - inset) };
  return { rx: Math.max(0, radius.rx - inset), ry: Math.max(0, radius.ry - inset), corners: {
    topLeft: Math.max(0, radius.corners.topLeft - inset), topRight: Math.max(0, radius.corners.topRight - inset),
    bottomRight: Math.max(0, radius.corners.bottomRight - inset), bottomLeft: Math.max(0, radius.corners.bottomLeft - inset),
  } };
}

function drawText(
  canvas: SkCanvas,
  text: string,
  rect: ReaderRect,
  paint: ReaderRunPaint,
  state: RenderState,
  lineHeightPx?: number,
): void {
  const fontMetrics = state.options.paragraphs.fonts.resolveFont(paint.font).getMetrics();
  const ascent = Math.max(0, -(fontMetrics?.ascent ?? -paint.font.sizePx * 0.8));
  const descent = Math.max(0, fontMetrics?.descent ?? paint.font.sizePx * 0.2);
  const contentTop = rect.y + paint.font.sizePx * 0.8 - ascent;
  drawInlineBox(canvas, rect, paint, state.alpha, { contentTop, contentHeight: ascent + descent });
  const paragraph = state.options.paragraphs.createParagraph(text, paint, {
    color: effectiveTextColor(
      paint.color,
      state.options.colorOverride,
      declaredGroundFor(rect, paint.backgroundColor, state.blockGrounds, state.pageGround),
    ),
    alpha: state.alpha,
    textShadow: paint.textShadow,
    lineHeightPx,
  });
  try {
    paragraph.layout(SINGLE_LINE_LAYOUT_WIDTH);
    const line = paragraph.getLineMetrics()[0];
    const targetBaseline = Math.round(rect.y + paint.font.sizePx * 0.8);
    const paragraphTop = line ? targetBaseline - line.baseline : rect.y;
    paragraph.paint(canvas, rect.x - (paint.letterSpacingPx ?? 0) / 2, paragraphTop);
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
  rubyAlign: 'space-around' | 'start' | 'center' | 'space-between' | undefined,
  lineHeightPx?: number,
): void {
  const align = rubyAlign ?? 'space-around';
  const units = segmentText(text);
  if ((align === 'space-around' || align === 'space-between') && units.length > 1) {
    const widths = units.map((unit) => state.options.paragraphs.measureShapedText(unit, paint).width);
    const total = widths.reduce((sum, value) => sum + value, 0);
    const available = Math.max(0, rect.width - total);
    const gap = align === 'space-between' ? available / Math.max(1, units.length - 1) : available / units.length;
    let x = rect.x + (align === 'space-around' ? gap / 2 : 0);
    for (let index = 0; index < units.length; index += 1) {
      drawText(canvas, units[index], { ...rect, x, width: widths[index] }, { ...paint, backgroundColor: undefined, border: undefined, padding: undefined }, state, lineHeightPx);
      x += widths[index] + gap;
    }
    return;
  }
  const measured = state.options.paragraphs.measureShapedText(text, paint).width;
  const x = align === 'start' ? rect.x : align === 'center' || align === 'space-around'
    ? rect.x + Math.max(0, (rect.width - measured) / 2)
    : rect.x + Math.max(0, rect.width - measured);
  drawText(
    canvas,
    text,
    { ...rect, x, width: measured },
    { ...paint, backgroundColor: undefined, border: undefined, padding: undefined },
    state,
    lineHeightPx,
  );
}

function segmentText(text: string): string[] {
  const Segmenter = (Intl as typeof Intl & {
    Segmenter?: new (locale?: string, options?: { granularity?: string }) => { segment(value: string): Iterable<{ segment: string }> };
  }).Segmenter;
  if (Segmenter) {
    return Array.from(new Segmenter('zh-Hans', { granularity: 'grapheme' }).segment(text), (part) => part.segment);
  }
  return Array.from(text);
}

function drawVerticalText(
  canvas: SkCanvas,
  text: string,
  rect: ReaderRect,
  paint: ReaderRunPaint,
  state: RenderState,
  ruby = false,
): void {
  const units = Array.from(text);
  if (units.length === 0) return;
  if (!ruby) drawVerticalInlineBox(canvas, rect, paint, state.alpha);
  const slotHeight = rect.height / units.length;
  const barePaint = { ...paint, backgroundColor: undefined, border: undefined, padding: undefined, decoration: undefined };
  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];
    const measured = state.options.paragraphs.measureShapedText(unit, paint).width;
    drawText(canvas, unit, {
      x: rect.x + Math.max(0, (rect.width - measured) / 2),
      y: rect.y + index * slotHeight,
      width: measured,
      height: slotHeight,
    }, barePaint, state);
  }
  if (paint.decoration && paint.decoration.thickness > 0) {
    if (paint.decoration.kind === 'line-through') {
      const y = rect.y + rect.height / 2;
      drawSolidLine(canvas, rect.x, y, rect.x + rect.width, y, paint.decoration.color, paint.decoration.thickness, state.alpha);
    } else {
      const x = rect.x + rect.width - paint.decoration.y;
      drawSolidLine(canvas, x, rect.y, x, rect.y + rect.height, paint.decoration.color, paint.decoration.thickness, state.alpha);
    }
  }
}

function drawVerticalInlineBox(canvas: SkCanvas, rect: ReaderRect, paint: ReaderRunPaint, alpha: number): void {
  const padding = paint.padding;
  const border = paint.border;
  const box = {
    x: rect.x - (padding?.left ?? 0) - (border?.start?.widthPx ?? 0),
    y: rect.y - (padding?.top ?? 0) - (border?.top?.widthPx ?? 0),
    width: rect.width + (padding?.left ?? 0) + (padding?.right ?? 0) + (border?.start?.widthPx ?? 0) + (border?.end?.widthPx ?? 0),
    height: rect.height + (padding?.top ?? 0) + (padding?.bottom ?? 0) + (border?.top?.widthPx ?? 0) + (border?.bottom?.widthPx ?? 0),
  };
  if (paint.backgroundColor) drawFilledRect(canvas, box, paint.backgroundColor, alpha, { rx: paint.backgroundRadius ?? 0, ry: paint.backgroundRadius ?? 0 });
  if (!border) return;
  drawRunBorder(canvas, border.top, box.x, box.y, box.x + box.width, box.y, alpha, 0);
  drawRunBorder(canvas, border.end, box.x + box.width, box.y, box.x + box.width, box.y + box.height, alpha, 1);
  drawRunBorder(canvas, border.bottom, box.x, box.y + box.height, box.x + box.width, box.y + box.height, alpha, 2);
  drawRunBorder(canvas, border.start, box.x, box.y, box.x, box.y + box.height, alpha, 3);
}

function drawInlineBox(
  canvas: SkCanvas,
  rect: ReaderRect,
  paint: ReaderRunPaint,
  alpha: number,
  metrics?: { readonly contentTop: number; readonly contentHeight: number },
): void {
  const box = computeInlineBox(rect, paint, metrics);
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
  const radius = paint.backgroundRadius ?? 0;
  if (radius > 0 && border.top && border.bottom && border.start && border.end) {
    const edges = [border.top, border.end, border.bottom, border.start];
    const first = edges[0];
    if (edges.every((edge) => edge.paint.style === first.paint.style && edge.paint.color === first.paint.color) && edges.every((edge) => edge.widthPx === first.widthPx)) {
      drawStyledRoundedBorder(canvas, box, { rx: radius, ry: radius }, first.paint, first.widthPx, alpha);
      return;
    }
  }
  drawRunBorder(canvas, border.top, box.x, box.y, box.x + box.width, box.y, alpha, 0);
  drawRunBorder(canvas, border.bottom, box.x, box.y + box.height, box.x + box.width, box.y + box.height, alpha, 2);
  drawRunBorder(canvas, border.start, box.x, box.y, box.x, box.y + box.height, alpha, 3);
  drawRunBorder(canvas, border.end, box.x + box.width, box.y, box.x + box.width, box.y + box.height, alpha, 1);
}

function computeInlineBox(rect: ReaderRect, paint: ReaderRunPaint, metrics?: { readonly contentTop: number; readonly contentHeight: number }): ReaderRect {
  const padding = paint.padding;
  const border = paint.border;
  const left = (padding?.left ?? 0) + (border?.start?.widthPx ?? 0);
  const right = (padding?.right ?? 0) + (border?.end?.widthPx ?? 0);
  const top = (padding?.top ?? 0) + (border?.top?.widthPx ?? 0);
  const bottom = (padding?.bottom ?? 0) + (border?.bottom?.widthPx ?? 0);
  return {
    x: rect.x - left,
    y: (metrics?.contentTop ?? rect.y) - top,
    width: rect.width + left + right,
    height: (metrics?.contentHeight ?? paint.font.sizePx) + top + bottom,
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
  side: 0 | 1 | 2 | 3,
): void {
  if (edge && edge.widthPx > 0) {
    drawBorderLine(canvas, { ...edge.paint, color: resolveDirectionalBorder(edge.paint, side) }, edge.widthPx, x1, y1, x2, y2, alpha);
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
  if (sourceRect && (sourceRect.x < 0 || sourceRect.y < 0 || sourceRect.width <= 0 || sourceRect.height <= 0 || sourceRect.x + sourceRect.width > asset.width || sourceRect.y + sourceRect.height > asset.height)) {
    throw new Error(`Skia image sourceRect is outside ${source}.`);
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
  paint: { color: ReaderColor | string; style: ReaderBorderPaintEdge['style'] },
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
  if (edge.style === 'none' || edge.style === 'hidden') return;
  [x1, y1, x2, y2] = snapBorderLine(x1, y1, x2, y2, width);
  if (edge.style === 'double') {
    const third = Math.max(1, width / 3);
    const horizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
    const offset = (width - third) / 2;
    drawBorderLine(canvas, { ...edge, style: 'solid' }, third,
      horizontal ? x1 : x1 - offset, horizontal ? y1 - offset : y1,
      horizontal ? x2 : x2 - offset, horizontal ? y2 - offset : y2, alpha);
    drawBorderLine(canvas, { ...edge, style: 'solid' }, third,
      horizontal ? x1 : x1 + offset, horizontal ? y1 + offset : y1,
      horizontal ? x2 : x2 + offset, horizontal ? y2 + offset : y2, alpha);
    return;
  }
  if (edge.style === 'groove' || edge.style === 'ridge') {
    const half = Math.max(1, width / 2);
    const horizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
    const offset = width / 4;
    const firstAlpha = edge.style === 'groove' ? alpha * 0.55 : alpha;
    const secondAlpha = edge.style === 'groove' ? alpha : alpha * 0.55;
    drawBorderLine(canvas, { ...edge, color: tintBorderColor(edge.color, edge.style === 'groove' ? 0.65 : 1), style: 'solid' }, half,
      horizontal ? x1 : x1 - offset, horizontal ? y1 - offset : y1,
      horizontal ? x2 : x2 - offset, horizontal ? y2 - offset : y2, firstAlpha);
    drawBorderLine(canvas, { ...edge, color: tintBorderColor(edge.color, edge.style === 'groove' ? 1 : 0.65), style: 'solid' }, half,
      horizontal ? x1 : x1 + offset, horizontal ? y1 + offset : y1,
      horizontal ? x2 : x2 + offset, horizontal ? y2 + offset : y2, secondAlpha);
    return;
  }
  if (edge.style === 'inset' || edge.style === 'outset') {
    drawBorderLine(canvas, { ...edge, style: 'solid' }, width, x1, y1, x2, y2, alpha * 0.8);
    return;
  }
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

function snapBorderLine(x1: number, y1: number, x2: number, y2: number, width: number): [number, number, number, number] {
  const offset = Math.round(width) % 2 === 1 ? 0.5 : 0;
  if (Math.abs(x2 - x1) >= Math.abs(y2 - y1)) {
    const y = Math.round((y1 + y2) / 2) + offset;
    return [Math.round(x1), y, Math.round(x2), y];
  }
  const x = Math.round((x1 + x2) / 2) + offset;
  return [x, Math.round(y1), x, Math.round(y2)];
}

function drawSolidLine(
  canvas: SkCanvas,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: ReaderColor | string,
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
  color: ReaderColor | string,
  alpha: number,
  radius: ResolvedRadius = { rx: 0, ry: 0 },
): void {
  const paint = createPaint(color, alpha);
  if (radius.rx > 0 || radius.ry > 0) {
    canvas.drawRRect(toRRect(toSkRect(rect), radius), paint);
  } else {
    canvas.drawRect(toSkRect(rect), paint);
  }
  paint.dispose();
}

function createPaint(
  color: string | import('../../contracts').ReaderColor,
  alpha: number,
  style = PaintStyle.Fill,
): SkPaint {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setStyle(style);
  const resolved = skiaColor(color);
  paint.setColor(resolved);
  paint.setAlphaf(clampAlpha(alpha * (resolved[3] ?? 1)));
  return paint;
}

function resolveRadius(
  paint: ReaderBlockPaint,
  rect: ReaderRect,
): ResolvedRadius {
  if (paint.radius?.pct !== undefined) {
    return {
      rx: (paint.radius.pct / 100) * rect.width,
      ry: (paint.radius.pct / 100) * rect.height,
    };
  }
  if (paint.radius?.corners) {
    const corners = paint.radius.corners;
    const tl = Math.max(0, corners.topLeft);
    const tr = Math.max(0, corners.topRight);
    const br = Math.max(0, corners.bottomRight);
    const bl = Math.max(0, corners.bottomLeft);
    const factor = Math.min(1, rect.width / Math.max(1e-6, tl + tr), rect.width / Math.max(1e-6, bl + br), rect.height / Math.max(1e-6, tl + bl), rect.height / Math.max(1e-6, tr + br));
    const scaled = { topLeft: tl * factor, topRight: tr * factor, bottomRight: br * factor, bottomLeft: bl * factor };
    return { rx: Math.max(...Object.values(scaled)), ry: Math.max(...Object.values(scaled)), corners: scaled };
  }
  const radius = paint.radius?.px ?? 0;
  return { rx: radius, ry: radius };
}

interface ResolvedRadius { readonly rx: number; readonly ry: number; readonly corners?: { readonly topLeft: number; readonly topRight: number; readonly bottomRight: number; readonly bottomLeft: number } }

function toRRect(rect: SkRect, radius: ResolvedRadius, spread = 0) {
  const corners = radius.corners;
  if (!corners) return Skia.RRectXY(rect, Math.max(0, Math.min(rect.width / 2, radius.rx + spread)), Math.max(0, Math.min(rect.height / 2, radius.ry + spread)));
  const maxX = rect.width / 2; const maxY = rect.height / 2;
  return {
    rect,
    topLeft: { x: Math.min(maxX, Math.max(0, corners.topLeft + spread)), y: Math.min(maxY, Math.max(0, corners.topLeft + spread)) },
    topRight: { x: Math.min(maxX, Math.max(0, corners.topRight + spread)), y: Math.min(maxY, Math.max(0, corners.topRight + spread)) },
    bottomRight: { x: Math.min(maxX, Math.max(0, corners.bottomRight + spread)), y: Math.min(maxY, Math.max(0, corners.bottomRight + spread)) },
    bottomLeft: { x: Math.min(maxX, Math.max(0, corners.bottomLeft + spread)), y: Math.min(maxY, Math.max(0, corners.bottomLeft + spread)) },
  };
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

function tilePositions(origin: number, size: number, boxStart: number, boxSize: number, repeat: boolean, mode: string): number[] {
  if (!repeat) return [origin];
  const safeSize = Math.max(1, size);
  if (mode === 'space') {
    const count = Math.floor(boxSize / safeSize);
    if (count <= 1) return [origin];
    const gap = (boxSize - count * safeSize) / (count - 1);
    return Array.from({ length: count }, (_, index) => boxStart + index * (safeSize + gap));
  }
  const count = Math.max(1, Math.ceil(boxSize / safeSize));
  const step = safeSize;
  const first = boxStart - Math.ceil((boxStart - origin) / Math.max(1, step)) * step;
  return Array.from({ length: Math.min(4096, count + 4) }, (_, i) => first + i * step).filter((v) => v < boxStart + boxSize);
}

function clampAlpha(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 1));
}

function tintBorderColor(color: ReaderColor | string, factor: number): ReaderColor | string {
  try {
    const rgba = new Float32Array(skiaColor(color));
    return `rgba(${Math.round(clampAlpha(rgba[0] * factor) * 255)}, ${Math.round(clampAlpha(rgba[1] * factor) * 255)}, ${Math.round(clampAlpha(rgba[2] * factor) * 255)}, ${clampAlpha(rgba[3])})`;
  } catch { return color; }
}

function isDirectionalBorderStyle(style: ReaderBorderPaintEdge['style']): boolean {
  return style === 'inset' || style === 'outset' || style === 'groove' || style === 'ridge';
}

function resolveDirectionalBorder(edge: ReaderBorderPaintEdge, side: number): ReaderColor | string {
  if (edge.style !== 'inset' && edge.style !== 'outset') return edge.color;
  const leading = side === 0 || side === 3;
  const dark = edge.style === 'inset' ? leading : !leading;
  return tintBorderColor(edge.color, dark ? 0.6 : 1.18);
}

function assertNever(value: never): never {
  throw new Error(`Unsupported Rito display-list command: ${JSON.stringify(value)}`);
}

function validateDisplayList(displayList: ReaderDisplayList): void {
  let depth = 0;
  for (const command of displayList.commands) {
    if (command.kind === 'pushState') depth += 1;
    if (command.kind === 'popState') {
      depth -= 1;
      if (depth < 0) throw new Error('Skia display list contains an unmatched popState.');
    }
    if (command.kind === 'opacity' && (!Number.isFinite(command.value) || command.value < 0 || command.value > 1)) {
      throw new Error('Skia display list opacity must be between 0 and 1.');
    }
    if (command.kind === 'paintBlock') {
      for (const shadow of command.paint.boxShadow ?? []) if (shadow.blur < 0) throw new Error('Skia box-shadow blur must not be negative.');
    }
    if ((command.kind === 'paintText' || command.kind === 'paintRuby')) {
      for (const shadow of command.paint.textShadow ?? []) if (shadow.blur < 0) throw new Error('Skia text-shadow blur must not be negative.');
    }
  }
  if (depth !== 0) throw new Error('Skia display list contains an unmatched pushState.');
}
