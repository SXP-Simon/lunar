export interface RitoDisplayPoint {
  readonly x: number;
  readonly y: number;
}

export interface RitoDisplaySize {
  readonly width: number;
  readonly height: number;
}

export interface RitoDisplayRect extends RitoDisplayPoint, RitoDisplaySize {}

export type RitoDisplayLength =
  | { readonly unit: 'px'; readonly value: number }
  | { readonly unit: 'percent'; readonly value: number };

export type RitoDisplayTransform =
  | { readonly kind: 'translate'; readonly x: RitoDisplayLength; readonly y: RitoDisplayLength }
  | { readonly kind: 'scale'; readonly sx: number; readonly sy: number }
  | { readonly kind: 'rotate'; readonly radians: number };

export type RitoBorderStyle = 'none' | 'hidden' | 'dotted' | 'dashed' | 'solid' | 'double' | 'groove' | 'ridge' | 'inset' | 'outset';

export interface RitoBorderPaintEdge {
  readonly color: string;
  readonly style: RitoBorderStyle;
}

export interface RitoRunPaint {
  readonly font: {
    readonly family: string;
    readonly sizePx: number;
    readonly weight: number;
    readonly style: 'normal' | 'italic';
  };
  readonly color: string;
  readonly wordSpacingPx?: number;
  readonly letterSpacingPx?: number;
  readonly backgroundColor?: string;
  readonly backgroundRadius?: number;
  readonly textShadow: readonly {
    readonly offsetX: number;
    readonly offsetY: number;
    readonly blur: number;
    readonly color: string;
  }[];
  readonly decoration?: {
    readonly kind: 'underline' | 'line-through';
    readonly y: number;
    readonly thickness: number;
    readonly color: string;
  };
  readonly padding?: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
  readonly border?: {
    readonly top?: { readonly widthPx: number; readonly paint: RitoBorderPaintEdge };
    readonly bottom?: { readonly widthPx: number; readonly paint: RitoBorderPaintEdge };
    readonly start?: { readonly widthPx: number; readonly paint: RitoBorderPaintEdge };
    readonly end?: { readonly widthPx: number; readonly paint: RitoBorderPaintEdge };
  };
}

export interface RitoBlockPaint {
  readonly background?: {
    readonly color?: string;
    readonly image?: string;
    readonly size?: 'auto' | 'cover' | 'contain';
    readonly repeat?: 'repeat' | 'no-repeat' | 'repeat-x' | 'repeat-y' | 'space' | 'round';
    readonly position?: { readonly x: RitoDisplayLength; readonly y: RitoDisplayLength };
  };
  readonly border?: {
    readonly top?: RitoBorderPaintEdge;
    readonly right?: RitoBorderPaintEdge;
    readonly bottom?: RitoBorderPaintEdge;
    readonly left?: RitoBorderPaintEdge;
  };
  readonly radius?: { readonly px?: number; readonly pct?: number; readonly corners?: { readonly topLeft: number; readonly topRight: number; readonly bottomRight: number; readonly bottomLeft: number } };
  readonly boxShadow: readonly {
    readonly offsetX: number;
    readonly offsetY: number;
    readonly blur: number;
    readonly spread: number;
    readonly color: string;
    readonly inset: boolean;
  }[];
}

export type RitoDisplayCommand =
  | { readonly kind: 'push-state' }
  | { readonly kind: 'pop-state' }
  | { readonly kind: 'translate'; readonly dx: number; readonly dy: number }
  | { readonly kind: 'opacity'; readonly value: number }
  | { readonly kind: 'transform'; readonly origin: RitoDisplayPoint; readonly boxSize: RitoDisplaySize; readonly transforms: readonly RitoDisplayTransform[] }
  | { readonly kind: 'clip-rect'; readonly rect: RitoDisplayRect; readonly radius?: { readonly rx: number; readonly ry: number } }
  | { readonly kind: 'paint-page'; readonly rect: RitoDisplayRect; readonly paint: { readonly backgroundColor?: string } }
  | { readonly kind: 'paint-block'; readonly rect: RitoDisplayRect; readonly paint: RitoBlockPaint; readonly borderBox?: { readonly topWidth: number; readonly rightWidth: number; readonly bottomWidth: number; readonly leftWidth: number } }
  | { readonly kind: 'paint-text'; readonly text: string; readonly rect: RitoDisplayRect; readonly paint: RitoRunPaint; readonly lineHeightPx?: number; readonly href?: string; readonly sourceText?: string; readonly sourceTextOffset?: bigint }
  | { readonly kind: 'paint-ruby'; readonly text: string; readonly rect: RitoDisplayRect; readonly paint: RitoRunPaint; readonly lineHeightPx?: number; readonly href?: string; readonly sourceText?: string; readonly sourceTextOffset?: bigint }
  | { readonly kind: 'paint-image'; readonly src: string; readonly rect: RitoDisplayRect; readonly alt?: string; readonly href?: string; readonly sourceRect?: RitoDisplayRect }
  | { readonly kind: 'paint-horizontal-rule'; readonly rect: RitoDisplayRect; readonly paint: { readonly color: string; readonly style: RitoBorderStyle } };

export interface RitoDisplayList {
  readonly formatVersion: 1;
  readonly commands: readonly RitoDisplayCommand[];
}
