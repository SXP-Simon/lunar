module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: './android',
        packageImportPath: 'import com.ritojs.reactnative.RitoReactNativePackage;',
        packageInstance: 'new RitoReactNativePackage()',
      },
      ios: {
        podspecPath: './ios/RitoReactNative.podspec',
      },
    },
  },
};
