import type {
  RitoDisplayCommand,
  RitoDisplayList,
} from '@modules/rito-rn/src/protocol/display-types';

import type { ReaderDisplayList, ReaderDrawCommand } from '../contracts';

/** Converts RITODL1 into Lunar's renderer-neutral DisplayList contract. */
export function toReaderV1DisplayList(
  displayList: RitoDisplayList,
  width: number,
  height: number,
): ReaderDisplayList {
  return {
    width,
    height,
    commands: displayList.commands.map(toReaderDrawCommand),
  };
}

function toReaderDrawCommand(command: RitoDisplayCommand): ReaderDrawCommand {
  switch (command.kind) {
    case 'push-state':
      return { kind: 'pushState' };
    case 'pop-state':
      return { kind: 'popState' };
    case 'translate':
      return { kind: 'translate', dx: command.dx, dy: command.dy };
    case 'opacity':
      return { kind: 'opacity', value: command.value };
    case 'transform':
      return {
        kind: 'transform',
        origin: command.origin,
        box: command.boxSize,
        transforms: command.transforms.map((transform) =>
          transform.kind === 'rotate'
            ? { kind: 'rotate', rad: transform.radians }
            : transform,
        ),
      };
    case 'clip-rect':
      return { kind: 'clipRect', rect: command.rect, radius: command.radius };
    case 'paint-page':
      return { kind: 'paintPage', rect: command.rect, paint: command.paint };
    case 'paint-block':
      return {
        kind: 'paintBlock',
        rect: command.rect,
        paint: command.paint,
        borderBox: command.borderBox,
      };
    case 'paint-text':
      return {
        kind: 'paintText',
        text: command.text,
        rect: command.rect,
        paint: command.paint,
        lineHeightPx: command.lineHeightPx,
        href: command.href,
        sourceText: command.sourceText,
        sourceTextOffset: toSafeOffset(command.sourceTextOffset),
        ...(command.vertical ? { vertical: true } : {}),
      };
    case 'paint-ruby':
      return {
        kind: 'paintRuby', text: command.text, rect: command.rect, paint: command.paint,
        ...(command.lineHeightPx === undefined ? {} : { lineHeightPx: command.lineHeightPx }),
        ...(command.href === undefined ? {} : { href: command.href }),
        ...(command.sourceText === undefined ? {} : { sourceText: command.sourceText }),
        ...(command.sourceTextOffset === undefined ? {} : { sourceTextOffset: toSafeOffset(command.sourceTextOffset) }),
        ...(command.rubyAlign === 'start' || command.rubyAlign === 'center' || command.rubyAlign === 'space-between' || command.rubyAlign === 'space-around' ? { rubyAlign: command.rubyAlign } : {}),
        ...(command.vertical ? { vertical: true } : {}),
      };
    case 'paint-image':
      return {
        kind: 'paintImage',
        src: command.src,
        rect: command.rect,
        alt: command.alt,
        href: command.href,
        sourceRect: command.sourceRect,
      };
    case 'paint-horizontal-rule':
      return { kind: 'paintHorizontalRule', rect: command.rect, paint: command.paint };
  }
}

function toSafeOffset(value: bigint | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Rito source text offset exceeds JavaScript safe integer range.');
  }
  return Number(value);
}
