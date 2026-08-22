module.exports = function configureBabel(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'react-native-worklets/plugin',
        {
          bundleMode: true,
          importForwarding: {
            moduleNames: ['@ritojs/core', '@shopify/react-native-skia'],
            relativePaths: ['src/reader'],
          },
        },
      ],
    ],
  };
};
