const { getDefaultConfig } = require('expo/metro-config');
const { getBundleModeMetroConfig } = require('react-native-worklets/bundleMode');
const { withUniwindConfig } = require('uniwind/metro');
const path = require('node:path');

const config = getBundleModeMetroConfig(getDefaultConfig(__dirname));
const workletsPackagePath = path.dirname(require.resolve('react-native-worklets/package.json'));
const workletsGeneratedPath = path.join(workletsPackagePath, '.worklets');
config.watchFolders = [
  ...(config.watchFolders ?? []),
  workletsPackagePath,
  workletsGeneratedPath,
];

const uniwindConfig = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
  dtsFile: './src/uniwind-types.d.ts',
});

// Bundle mode redirects runtime imports to their runtime shim when required.
// Uniwind's own component proxy must resolve the real React Native package to
// avoid a proxy -> shim -> proxy module cycle during native startup.
const uniwindResolver = uniwindConfig.resolver.resolveRequest;
uniwindConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === 'react-native' &&
    context.originModulePath.includes(`${path.sep}uniwind${path.sep}`)
  ) {
    return context.resolveRequest(context, moduleName, platform);
  }
  return uniwindResolver(context, moduleName, platform);
};

module.exports = uniwindConfig;
