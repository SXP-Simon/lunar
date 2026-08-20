import type { DisplayList, DisplayListRenderer, ImageAssetResolver } from '@ritojs/core';
import type { SkCanvas } from '@shopify/react-native-skia';

import type { SkiaImageAsset } from './image-decoder';

export interface SkiaDisplayListRenderOptions {
  readonly pixelRatio: number;
  readonly images: ImageAssetResolver<SkiaImageAsset>;
}

export type LunarSkiaDisplayListRenderer = DisplayListRenderer<
  SkCanvas,
  SkiaDisplayListRenderOptions
>;

export interface SkiaDisplayListCompiler {
  render(
    displayList: DisplayList,
    canvas: SkCanvas,
    options: SkiaDisplayListRenderOptions,
  ): void;
}
