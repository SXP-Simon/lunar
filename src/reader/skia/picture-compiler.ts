import type { SkPicture } from '@shopify/react-native-skia';

import type { ReaderDisplayList } from '../contracts';
import type { SkiaDisplayListRenderOptions } from './display-list-renderer';

export interface CompiledReaderPicture {
  readonly picture: SkPicture;
  readonly width: number;
  readonly height: number;
}

export interface PictureCompiler {
  compile(
    displayList: ReaderDisplayList,
    options: SkiaDisplayListRenderOptions,
  ): CompiledReaderPicture;
  dispose(picture: CompiledReaderPicture): void;
}
