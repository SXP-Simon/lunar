import type { DisplayList } from '@ritojs/core';
import type { SkPicture } from '@shopify/react-native-skia';

import type { SkiaDisplayListRenderOptions } from './display-list-renderer';

export interface CompiledReaderPicture {
  readonly picture: SkPicture;
  readonly width: number;
  readonly height: number;
}

export interface PictureCompiler {
  compile(
    displayList: DisplayList,
    options: SkiaDisplayListRenderOptions,
  ): CompiledReaderPicture;
  dispose(picture: CompiledReaderPicture): void;
}
