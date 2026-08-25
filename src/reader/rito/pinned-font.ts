import * as Crypto from 'expo-crypto';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';

import { readNativeReaderBuiltinFont } from '../native/archive-module';
import { LUNAR_READER_FONT_FAMILY } from '../typography';
import type { RitoNativePinnedFontFace } from './rito-native';

/** Builds the pinned measurement face used by Rito Rust and Lunar Skia. */
export async function createLunarRitoPinnedFonts(options: {
  readonly loadFontBytes?: () => Promise<Uint8Array>;
} = {}): Promise<readonly RitoNativePinnedFontFace[]> {
  const bytes = options.loadFontBytes ? await options.loadFontBytes() : readNativeReaderBuiltinFont();
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes as unknown as Uint8Array<ArrayBuffer>);
  const expectedSha256 = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
  return [{ bytes, expectedSha256, genericRole: 'serif', language: 'und' }];
}

export const LUNAR_RITO_PINNED_FONT_FAMILY = LUNAR_READER_FONT_FAMILY;

export async function loadBundledLunarFontBytes(): Promise<Uint8Array> {
  const asset = Asset.fromModule(require('../../../assets/fonts/LXGWWenKai-Regular.ttf'));
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  return new Uint8Array(await new File(uri).arrayBuffer());
}
