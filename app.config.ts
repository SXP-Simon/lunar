import type { ConfigContext, ExpoConfig } from 'expo/config';

const SUPPORTED_ANDROID_ABIS = new Set(['arm64-v8a']);

function getAndroidAbis(value: string | undefined): string[] | undefined {
  const abis = value
    ?.split(',')
    .map((abi) => abi.trim())
    .filter((abi) => SUPPORTED_ANDROID_ABIS.has(abi));

  return abis?.length ? abis : undefined;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const isDevelopment = process.env.APP_VARIANT === 'development';
  const isNightly = process.env.APP_VARIANT === 'nightly';
  const name = config.name ?? 'lunar';
  const androidPackage = config.android?.package ?? 'com.lunarain_079.lunar';
  const compactAndroidDevBuild = process.env.LUNAR_ANDROID_COMPACT_DEV_BUILD === 'true';
  const compactAndroidApk = compactAndroidDevBuild || process.env.LUNAR_ANDROID_COMPACT_APK === 'true';
  const buildArchs = getAndroidAbis(process.env.LUNAR_ANDROID_ABIS);

  return {
    ...config,
    name: isDevelopment ? `${name} Dev` : isNightly ? `${name} Nightly` : name,
    slug: config.slug ?? 'lunar',
    scheme: isDevelopment ? 'lunar-dev' : isNightly ? 'lunar-nightly' : config.scheme,
    android: {
      ...config.android,
      package: isDevelopment ? `${androidPackage}.dev` : androidPackage,
    },
    plugins: [
      ...(config.plugins ?? []),
      ['expo-dev-client', { addGeneratedScheme: isDevelopment }],
      './plugins/with-rito-react-native',
      'expo-localization',
      [
        'expo-build-properties',
        {
          android: {
            buildArchs,
            enableMinifyInReleaseBuilds: true,
            enableShrinkResourcesInReleaseBuilds: true,
            // Compress standalone APK downloads; keep AAB packaging defaults.
            ...(compactAndroidApk && {
              enableBundleCompression: true,
              useLegacyPackaging: true,
            }),
            ...(compactAndroidDevBuild && { networkInspector: false }),
          },
        },
      ],
      'expo-asset',
    ],
  };
};
