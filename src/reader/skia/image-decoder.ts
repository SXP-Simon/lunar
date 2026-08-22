import { Skia, type SkImage } from '@shopify/react-native-skia';

import type {
  ReaderImageDecoder,
  ReaderImageDimensions,
  ReaderImageResource,
} from '../contracts';

export interface SkiaImageAsset extends ReaderImageDimensions {
  readonly image: SkImage;
  readonly byteLength: number;
}

export type SkiaImageDecoder = ReaderImageDecoder<SkiaImageAsset>;

export class LunarSkiaImageDecoder implements SkiaImageDecoder {
  async decode(resource: ReaderImageResource): Promise<SkiaImageAsset> {
    const data = Skia.Data.fromBytes(resource.bytes);
    try {
      const image = Skia.Image.MakeImageFromEncoded(data);
      if (!image) {
        throw new Error(`Skia could not decode the image ${resource.href}.`);
      }
      const width = image.width();
      const height = image.height();
      return {
        image,
        width,
        height,
        byteLength: Math.max(resource.bytes.byteLength, width * height * 4),
      };
    } finally {
      data.dispose();
    }
  }

  dispose(asset: SkiaImageAsset): void {
    asset.image.dispose();
  }
}

export interface SkiaImageCacheOptions {
  readonly getBytes: (source: string) => Uint8Array | undefined;
  readonly maxBytes?: number;
  readonly decoder?: SkiaImageDecoder;
}

export class SkiaImageCache {
  private readonly entries = new Map<string, SkiaImageAsset>();
  private readonly getBytes: SkiaImageCacheOptions['getBytes'];
  private readonly maxBytes: number;
  private readonly decoder: SkiaImageDecoder;
  private totalBytes = 0;

  constructor(options: SkiaImageCacheOptions) {
    this.getBytes = options.getBytes;
    this.maxBytes = options.maxBytes ?? 64 * 1024 * 1024;
    this.decoder = options.decoder ?? new LunarSkiaImageDecoder();
  }

  resolveImage(source: string): SkiaImageAsset | undefined {
    const value = this.entries.get(source);
    if (!value) {
      return undefined;
    }
    this.entries.delete(source);
    this.entries.set(source, value);
    return value;
  }

  async preload(sources: readonly string[]): Promise<void> {
    for (const source of new Set(sources)) {
      if (this.entries.has(source)) {
        this.resolveImage(source);
        continue;
      }
      const bytes = this.getBytes(source);
      if (!bytes) {
        continue;
      }
      const asset = await this.decoder.decode({ href: source, bytes });
      this.entries.set(source, asset);
      this.totalBytes += asset.byteLength;
      this.evictOverflow(source);
    }
  }

  clear(): void {
    for (const asset of new Set(this.entries.values())) {
      this.decoder.dispose(asset);
    }
    this.entries.clear();
    this.totalBytes = 0;
  }

  private evictOverflow(protectedSource: string): void {
    while (this.totalBytes > this.maxBytes && this.entries.size > 1) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) {
        return;
      }
      if (oldest === protectedSource) {
        const protectedAsset = this.entries.get(oldest);
        this.entries.delete(oldest);
        if (protectedAsset) {
          this.entries.set(oldest, protectedAsset);
        }
        continue;
      }
      const asset = this.entries.get(oldest);
      this.entries.delete(oldest);
      if (asset) {
        this.totalBytes -= asset.byteLength;
        this.decoder.dispose(asset);
      }
    }
  }
}
