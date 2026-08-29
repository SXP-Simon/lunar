const { withAppBuildGradle } = require('expo/config-plugins');
const path = require('path');
const fs = require('fs');

function appendOnce(contents, insertion, marker) {
  return contents.includes(marker) ? contents : `${contents.trimEnd()}\n${insertion}\n`;
}

module.exports = function withRitoReactNative(config) {
  return withAppBuildGradle(config, (mod) => {
    const projectRoot = mod.modRequest.projectRoot;
    const localRitoPackageRoot = path.join(projectRoot, 'modules', 'rito-rn');
    const ritoPackageRoot = fs.existsSync(path.join(localRitoPackageRoot, 'native', 'rito'))
      ? localRitoPackageRoot
      : path.dirname(require.resolve('@ritojs/react-native/package.json', { paths: [projectRoot] }));
    const ritoPackageRelative = path
      .relative(path.join(projectRoot, 'android', 'app'), ritoPackageRoot)
      .replace(/\\/g, '/');
    const ritoAndroidConfig = `
// Rito Nitro C++ configuration.
def ritoPackageRoot = file('${ritoPackageRelative}')
def ritoFfiSourceInput = providers.gradleProperty('ritoFfiSourceDir')
    .orElse(providers.environmentVariable('RITO_FFI_SOURCE_DIR'))
    .orNull
def ritoFfiSourceDir = ritoFfiSourceInput != null
    ? rootProject.file(ritoFfiSourceInput)
    : new File(ritoPackageRoot, 'native/rito')
def ritoFfiSourceAvailable = ritoFfiSourceDir.isDirectory()
def ritoFfiOutputDir = layout.buildDirectory.dir('rito-ffi').get().asFile
def ritoFfiTargetDir = new File(ritoFfiSourceDir, 'target')
def ritoForceRebuild = providers.gradleProperty('ritoFfiRebuild')
    .orElse(providers.environmentVariable('RITO_FFI_REBUILD'))
    .map { it == '1' || it.equalsIgnoreCase('true') }
    .orElse(false)
    .get()

android {
    externalNativeBuild {
        cmake {
            buildStagingDirectory '../../.cxx'
        }
    }
    defaultConfig {
        ndk { abiFilters 'arm64-v8a' }
        externalNativeBuild {
            cmake {
                arguments '-DRITO_FFI_SOURCE_DIR=' + (ritoFfiSourceAvailable ? ritoFfiSourceDir.absolutePath.replace('\\\\', '/') : ''),
                    '-DRITO_FFI_LIBRARY_ROOT=' + ritoFfiOutputDir.absolutePath.replace('\\\\', '/')
            }
        }
    }
}

tasks.register('buildRitoFfiArm64') {
    onlyIf { ritoForceRebuild || !ritoFfiSourceAvailable || !new File(ritoFfiOutputDir, 'arm64-v8a/release/librito_ffi.a').exists() }
    outputs.upToDateWhen { !ritoForceRebuild }
    inputs.dir(ritoFfiSourceDir)
    outputs.file(new File(ritoFfiOutputDir, 'arm64-v8a/release/librito_ffi.a'))
    doFirst {
        if (!ritoFfiSourceAvailable) {
            throw new GradleException('The bundled Rito source is missing. Expected modules/rito-rn/native/rito or RITO_FFI_SOURCE_DIR.')
        }
        def staticLibrary = new File(ritoFfiTargetDir, 'aarch64-linux-android/release/librito_ffi.a')
        if (!staticLibrary.exists() || ritoForceRebuild) {
            def cargoResult = providers.exec {
                commandLine 'cargo',
                    'ndk', '-t', 'arm64-v8a', '-o', ritoFfiOutputDir.absolutePath,
                    'build', '--release', '--target-dir', ritoFfiTargetDir.absolutePath,
                    '--manifest-path', new File(ritoFfiSourceDir, 'crates/rito-ffi/Cargo.toml').absolutePath
                workingDir ritoFfiSourceDir
            }
            cargoResult.result.get().assertNormalExitValue()
        }
    }
    doLast {
        def staticLibrary = new File(ritoFfiTargetDir, 'aarch64-linux-android/release/librito_ffi.a')
        def destination = new File(ritoFfiOutputDir, 'arm64-v8a/release/librito_ffi.a')
        if (!staticLibrary.exists()) {
            throw new GradleException("The Rito FFI static library was not generated: \${staticLibrary}")
        }
        destination.parentFile.mkdirs()
        destination.bytes = staticLibrary.bytes
    }
}

def ritoFfiBuildTask = tasks.named('buildRitoFfiArm64')
// The Pure C++ module has its own Gradle project. Its CMake tasks must wait
// for the app task that produces the imported Rust static library.
def ritoModuleAndroidDir = new File(ritoPackageRoot, 'android').canonicalFile
gradle.allprojects { targetProject ->
    if (targetProject == project || targetProject.projectDir.canonicalFile == ritoModuleAndroidDir) {
        targetProject.tasks.matching { task ->
            task.name.startsWith('configureCMake') || task.name.startsWith('buildCMake')
        }.configureEach {
            dependsOn(ritoFfiBuildTask)
        }
    }
}
`;
    mod.modResults.contents = appendOnce(
      mod.modResults.contents,
      ritoAndroidConfig,
      '// Rito Nitro C++ configuration.',
    );
    return mod;
  });
};
