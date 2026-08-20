import type { ImageDecoder, ImageDimensions } from '@ritojs/core';
import type { SkImage } from '@shopify/react-native-skia';

export interface SkiaImageAsset extends ImageDimensions {
  readonly image: SkImage;
  readonly byteLength: number;
}

export type SkiaImageDecoder = ImageDecoder<SkiaImageAsset>;
