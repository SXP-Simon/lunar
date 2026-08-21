import type { SkImage } from '@shopify/react-native-skia';

import type { ReaderImageDecoder, ReaderImageDimensions } from '../contracts';

export interface SkiaImageAsset extends ReaderImageDimensions {
  readonly image: SkImage;
  readonly byteLength: number;
}

export type SkiaImageDecoder = ReaderImageDecoder<SkiaImageAsset>;
