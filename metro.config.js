const { getDefaultConfig } = require('expo/metro-config');
const { getBundleModeMetroConfig } = require('react-native-worklets/bundleMode');
const { withUniwindConfig } = require('uniwind/metro');
const path = require('node:path');

const config = getBundleModeMetroConfig(getDefaultConfig(__dirname));
const workletsPackagePath = path.dirname(require.resolve('react-native-worklets/package.json'));
config.watchFolders = [...(config.watchFolders ?? []), workletsPackagePath];

module.exports = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
  dtsFile: './src/uniwind-types.d.ts',
});
