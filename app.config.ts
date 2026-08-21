import type { ConfigContext, ExpoConfig } from 'expo/config';

const SUPPORTED_ANDROID_ABIS = new Set([
  'armeabi-v7a',
  'arm64-v8a',
  'x86',
  'x86_64',
]);

function getAndroidAbis(value: string | undefined): string[] | undefined {
  const abis = value
    ?.split(',')
    .map((abi) => abi.trim())
    .filter((abi) => SUPPORTED_ANDROID_ABIS.has(abi));

  return abis?.length ? abis : undefined;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const compactAndroidDevBuild =
    process.env.LUNAR_ANDROID_COMPACT_DEV_BUILD === 'true';
  const buildArchs = getAndroidAbis(process.env.LUNAR_ANDROID_ABIS);

  return {
    ...config,
    name: config.name ?? 'lunar',
    slug: config.slug ?? 'lunar',
    plugins: [
      ...(config.plugins ?? []),
      [
        'expo-build-properties',
        {
          android: compactAndroidDevBuild
            ? {
                buildArchs,
                enableBundleCompression: true,
                networkInspector: false,
                useLegacyPackaging: true,
              }
            : {},
        },
      ],
    ],
  };
};
