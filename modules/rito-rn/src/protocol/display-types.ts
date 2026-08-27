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

export type RitoColorSpace = 'srgb' | 'hsl' | 'hwb' | 'lab' | 'lch' | 'oklab' | 'oklch' | 'srgb-linear' | 'display-p3' | 'display-p3-linear' | 'a98-rgb' | 'prophoto-rgb' | 'rec2020' | 'xyz-d50' | 'xyz-d65';
export interface RitoTypedColor {
  readonly space: RitoColorSpace;
  readonly components: readonly [number, number, number];
  readonly alpha: number;
  readonly none: { readonly component0: boolean; readonly component1: boolean; readonly component2: boolean; readonly alpha: boolean };
}
export type RitoPaintColor = string | RitoTypedColor;

export interface RitoBorderPaintEdge {
    readonly color: RitoPaintColor;
  readonly style: RitoBorderStyle;
}

export interface RitoRunPaint {
  readonly font: {
    readonly family: string;
    readonly sizePx: number;
    readonly weight: number;
    readonly style: 'normal' | 'italic';
  };
    readonly color: RitoPaintColor;
  readonly wordSpacingPx?: number;
  readonly letterSpacingPx?: number;
  readonly backgroundColor?: RitoPaintColor;
  readonly backgroundRadius?: number;
  readonly textShadow: readonly {
    readonly offsetX: number;
    readonly offsetY: number;
    readonly blur: number;
    readonly color: RitoPaintColor;
  }[];
  readonly decoration?: {
    readonly kind: 'underline' | 'line-through';
    readonly y: number;
    readonly thickness: number;
    readonly color: RitoPaintColor;
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
    readonly color?: RitoPaintColor;
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
    readonly color: RitoPaintColor;
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
  | { readonly kind: 'paint-page'; readonly rect: RitoDisplayRect; readonly paint: { readonly backgroundColor?: RitoPaintColor } }
  | { readonly kind: 'paint-block'; readonly rect: RitoDisplayRect; readonly paint: RitoBlockPaint; readonly borderBox?: { readonly topWidth: number; readonly rightWidth: number; readonly bottomWidth: number; readonly leftWidth: number } }
  | { readonly kind: 'paint-text'; readonly text: string; readonly rect: RitoDisplayRect; readonly paint: RitoRunPaint; readonly lineHeightPx?: number; readonly href?: string; readonly sourceText?: string; readonly sourceTextOffset?: bigint }
  | { readonly kind: 'paint-ruby'; readonly text: string; readonly rect: RitoDisplayRect; readonly paint: RitoRunPaint; readonly lineHeightPx?: number; readonly href?: string; readonly sourceText?: string; readonly sourceTextOffset?: bigint; readonly rubyAlign?: string }
  | { readonly kind: 'paint-image'; readonly src: string; readonly rect: RitoDisplayRect; readonly alt?: string; readonly href?: string; readonly sourceRect?: RitoDisplayRect }
  | { readonly kind: 'paint-horizontal-rule'; readonly rect: RitoDisplayRect; readonly paint: { readonly color: RitoPaintColor; readonly style: RitoBorderStyle } };

export interface RitoDisplayList {
  readonly formatVersion: 1;
  readonly commands: readonly RitoDisplayCommand[];
}
