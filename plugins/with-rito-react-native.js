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
def ritoFfiSourceInput = providers.gradleProperty('ritoFfiSourceDir')
    .orElse(providers.environmentVariable('RITO_FFI_SOURCE_DIR'))
    .orNull
def ritoFfiSourceDir = ritoFfiSourceInput != null
    ? rootProject.file(ritoFfiSourceInput)
    : new File(ritoPackageRoot, 'native/rito')
def ritoFfiSourceAvailable = ritoFfiSourceDir.isDirectory()
def ritoFfiOutputDir = layout.buildDirectory.dir('rito-ffi').get().asFile
def ritoCodegenOutputDir = layout.buildDirectory.dir('rito-codegen').get().asFile
def ritoFfiTargetDir = new File(ritoFfiSourceDir, 'target')
def ritoForceRebuild = providers.environmentVariable('RITO_FFI_REBUILD')
    .map { it == '1' || it.equalsIgnoreCase('true') }
    .orElse(false)
    .get()

android {
    defaultConfig {
        ndk { abiFilters 'arm64-v8a' }
        externalNativeBuild {
            cmake {
                arguments '-DRITO_FFI_SOURCE_DIR=' + (ritoFfiSourceAvailable ? ritoFfiSourceDir.absolutePath.replace('\\\\', '/') : ''),
                    '-DRITO_FFI_LIBRARY_ROOT=' + ritoFfiOutputDir.absolutePath.replace('\\\\', '/'),
                    '-DRITO_CODEGEN_DIR=' + new File(ritoCodegenOutputDir, 'jni').absolutePath.replace('\\\\', '/')
            }
        }
    }
}

tasks.register('buildRitoFfiArm64') {
    onlyIf { ritoForceRebuild || !ritoFfiSourceAvailable || !new File(ritoFfiOutputDir, 'arm64-v8a/release/librito_ffi.a').exists() }
    inputs.dir(ritoFfiSourceDir)
    outputs.file(new File(ritoFfiOutputDir, 'arm64-v8a/release/librito_ffi.a'))
    doFirst {
        if (!ritoFfiSourceAvailable) {
            throw new GradleException('The bundled Rito 1.0.0 source is missing. Expected modules/rito-rn/native/rito or RITO_FFI_SOURCE_DIR.')
        }
        def staticLibrary = new File(ritoFfiTargetDir, 'aarch64-linux-android/release/librito_ffi.a')
        if (!staticLibrary.exists() || ritoForceRebuild) {
            project.exec {
                executable 'cargo'
                workingDir ritoFfiSourceDir
                args 'ndk', '-t', 'arm64-v8a', '-o', ritoFfiOutputDir.absolutePath,
                    'build', '--release', '--target-dir', ritoFfiTargetDir.absolutePath,
                    '--manifest-path', new File(ritoFfiSourceDir, 'crates/rito-ffi/Cargo.toml').absolutePath
            }
        }
    }
    doLast {
        def staticLibrary = new File(ritoFfiTargetDir, 'aarch64-linux-android/release/librito_ffi.a')
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
