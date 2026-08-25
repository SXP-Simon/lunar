import type { ConfigContext, ExpoConfig } from 'expo/config';

const SUPPORTED_ANDROID_ABIS = new Set([
  'arm64-v8a',
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
      './plugins/with-rito-react-native',
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
