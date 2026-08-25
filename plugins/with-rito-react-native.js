const { withAppBuildGradle } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

function appendOnce(contents, insertion) {
  return contents.includes(insertion.trim()) ? contents : `${contents.trimEnd()}\n${insertion}\n`;
}

module.exports = function withRitoReactNative(config) {
  return withAppBuildGradle(config, (mod) => {
    const projectRoot = mod.modRequest.projectRoot;
    const localRitoPackageRoot = path.join(projectRoot, 'modules', 'rito-rn');
    const ritoPackageRoot = fs.existsSync(path.join(localRitoPackageRoot, 'scripts', 'generate-codegen.mjs'))
      ? localRitoPackageRoot
      : path.dirname(
          require.resolve('@ritojs/react-native/package.json', { paths: [projectRoot] }),
        );
    const ritoPackageRelative = path
      .relative(path.join(projectRoot, 'android', 'app'), ritoPackageRoot)
      .replace(/\\/g, '/');
    const ritoAndroidConfig = `
// Rito Pure C++ Turbo Module configuration.
def ritoPackageRoot = file('${ritoPackageRelative}')
def ritoFfiSourceDir = providers.gradleProperty('ritoFfiSourceDir')
    .orElse(providers.environmentVariable('RITO_FFI_SOURCE_DIR'))
    .orNull
def ritoFfiOutputDir = layout.buildDirectory.dir('rito-ffi').get().asFile
def ritoCodegenOutputDir = layout.buildDirectory.dir('rito-codegen').get().asFile

android {
    defaultConfig {
        ndk { abiFilters 'arm64-v8a' }
        externalNativeBuild {
            cmake {
                arguments '-DRITO_FFI_SOURCE_DIR=' + (ritoFfiSourceDir ?: ''),
                    '-DRITO_FFI_LIBRARY_ROOT=' + ritoFfiOutputDir.absolutePath.replace('\\\\', '/'),
                    '-DRITO_CODEGEN_DIR=' + new File(ritoCodegenOutputDir, 'jni').absolutePath.replace('\\\\', '/')
            }
        }
    }
}

tasks.register('buildRitoFfiArm64', Exec) {
    onlyIf { ritoFfiSourceDir != null }
    doFirst {
        if (ritoFfiSourceDir == null) {
            throw new GradleException('RITO_FFI_SOURCE_DIR must point to the pinned Rito 1.0.0 checkout.')
        }
        executable 'cargo'
        workingDir ritoFfiSourceDir
        args 'ndk', '-t', 'arm64-v8a', '-o', ritoFfiOutputDir.absolutePath,
            'build', '--release', '--manifest-path',
            new File(ritoFfiSourceDir, 'crates/rito-ffi/Cargo.toml').absolutePath
    }
    doLast {
        def staticLibrary = new File(ritoFfiSourceDir, 'target/aarch64-linux-android/release/librito_ffi.a')
        def destination = new File(ritoFfiOutputDir, 'arm64-v8a/release/librito_ffi.a')
        if (!staticLibrary.exists()) {
            throw new GradleException("Rito FFI static library was not generated: \${staticLibrary}")
        }
        destination.parentFile.mkdirs()
        destination.bytes = staticLibrary.bytes
    }
}

tasks.register('generateRitoCodegen', Exec) {
    inputs.dir(new File(ritoPackageRoot, 'specs'))
    outputs.dir(ritoCodegenOutputDir)
    executable 'node'
    args new File(ritoPackageRoot, 'scripts/generate-codegen.mjs').absolutePath,
        ritoCodegenOutputDir.absolutePath
}

tasks.matching { task ->
    task.name.startsWith('configureCMake') || task.name.startsWith('buildCMake')
}.configureEach {
    dependsOn(tasks.named('buildRitoFfiArm64'), tasks.named('generateRitoCodegen'))
}
`;
    mod.modResults.contents = appendOnce(mod.modResults.contents, ritoAndroidConfig);
    return mod;
  });
};
