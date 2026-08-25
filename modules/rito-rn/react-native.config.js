module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: './android-pure-cxx',
        cxxModuleCMakeListsModuleName: 'rito_react_native',
        cxxModuleCMakeListsPath: 'CMakeLists.txt',
        cxxModuleHeaderName: 'NativeRitoReader',
      },
      ios: {
        podspecPath: './ios/RitoReactNative.podspec',
      },
    },
  },
};
