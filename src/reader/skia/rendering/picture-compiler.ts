import { Skia, type SkPicture } from '@shopify/react-native-skia';

import type { ReaderDisplayList } from '../../contracts';
import type { SkiaDisplayListRenderOptions } from './display-list-renderer';
import { SkiaDisplayListRenderer } from './display-list-renderer';

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

export class SkiaPictureCompiler implements PictureCompiler {
  constructor(private readonly renderer = new SkiaDisplayListRenderer()) {}

  compile(
    displayList: ReaderDisplayList,
    options: SkiaDisplayListRenderOptions,
  ): CompiledReaderPicture {
    const width = displayList.width * options.pixelRatio;
    const height = displayList.height * options.pixelRatio;
    const recorder = Skia.PictureRecorder();
    try {
      const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));
      this.renderer.render(displayList, canvas, options);
      return {
        picture: recorder.finishRecordingAsPicture(),
        width,
        height,
      };
    } finally {
      recorder.dispose();
    }
  }

  dispose(picture: CompiledReaderPicture): void {
    picture.picture.dispose();
  }
}
