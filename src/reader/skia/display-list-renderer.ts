import type { SkCanvas } from '@shopify/react-native-skia';

import type { ReaderDisplayList } from '../contracts';
import type { SkiaImageAsset } from './image-decoder';

export interface SkiaDisplayListRenderOptions {
  readonly pixelRatio: number;
  readonly images: {
    resolveImage(source: string): SkiaImageAsset | undefined;
  };
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
