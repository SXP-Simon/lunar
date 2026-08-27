import * as Crypto from 'expo-crypto';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';

import { LUNAR_READER_FONT_FAMILY } from '../typography';
import type { RitoNativePinnedFontFace } from './rito-native';

/** Builds the pinned measurement face used by Rito Rust and Lunar Skia. */
export async function createLunarRitoPinnedFonts(options: {
  readonly loadFontBytes?: () => Promise<Uint8Array>;
} = {}): Promise<readonly RitoNativePinnedFontFace[]> {
  const bytes = options.loadFontBytes ? await options.loadFontBytes() : await loadBundledLunarFontBytes();
  const expectedSha256 = options.loadFontBytes
    ? await digestFontBytes(bytes)
    : await loadBundledLunarFontSha256(bytes);
  return [{ bytes, expectedSha256, genericRole: 'serif', language: 'und' }];
}

export const LUNAR_RITO_PINNED_FONT_FAMILY = LUNAR_READER_FONT_FAMILY;

export async function loadBundledLunarFontBytes(): Promise<Uint8Array> {
  bundledFontBytesPromise ??= (async () => {
    const asset = Asset.fromModule(require('../../../assets/fonts/LXGWWenKai-Regular.ttf'));
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    return new Uint8Array(await new File(uri).arrayBuffer());
  })();
  return bundledFontBytesPromise;
}

let bundledFontBytesPromise: Promise<Uint8Array> | undefined;
let bundledFontSha256Promise: Promise<string> | undefined;

async function loadBundledLunarFontSha256(bytes: Uint8Array): Promise<string> {
  bundledFontSha256Promise ??= digestFontBytes(bytes);
  return bundledFontSha256Promise;
}

async function digestFontBytes(bytes: Uint8Array): Promise<string> {
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes as unknown as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}
